/** Run read-only first; --apply requires both Blob tokens and a protected --journal path. */
import { PrismaClient } from '@prisma/client';
import { put, del, get } from '@vercel/blob';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const db = new PrismaClient();
const apply = process.argv.includes('--apply');
const journal = process.argv[process.argv.indexOf('--journal') + 1];
type Item = {
  model: 'childDocument' | 'staffDocument' | 'invoice';
  id: string;
  old: string;
  next: string;
};
async function update(item: Item) {
  if (item.model === 'invoice')
    await db.invoice.updateMany({
      where: { id: item.id, pdfUrl: item.old },
      data: { pdfUrl: item.next },
    });
  else if (item.model === 'childDocument')
    await db.childDocument.updateMany({
      where: { id: item.id, fileUrl: item.old },
      data: { fileUrl: item.next },
    });
  else
    await db.staffDocument.updateMany({
      where: { id: item.id, fileUrl: item.old },
      data: { fileUrl: item.next },
    });
  await del(item.old, { token: process.env.BLOB_READ_WRITE_TOKEN });
  const response = await fetch(item.old, { cache: 'no-store' });
  if (response.ok)
    throw Error(
      `Public object still accessible for ${item.model}/${item.id}; retry after CDN invalidation`,
    );
}
async function main() {
  if (
    apply &&
    (!process.env.BLOB_PRIVATE_READ_WRITE_TOKEN ||
      !process.env.BLOB_READ_WRITE_TOKEN ||
      !process.argv.includes('--journal') ||
      !journal.startsWith('/'))
  )
    throw Error(
      '--apply requires both Blob tokens and an absolute --journal path outside the repository',
    );
  if (apply && existsSync(journal))
    for (const line of readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean))
      await update(JSON.parse(line));
  const [children, staff, invoices] = await Promise.all([
    db.childDocument.findMany({ select: { id: true, fileUrl: true } }),
    db.staffDocument.findMany({ select: { id: true, fileUrl: true } }),
    db.invoice.findMany({ where: { pdfUrl: { not: null } }, select: { id: true, pdfUrl: true } }),
  ]);
  const items = [
    ...children.map((d) => ({ model: 'childDocument' as const, id: d.id, old: d.fileUrl })),
    ...staff.map((d) => ({ model: 'staffDocument' as const, id: d.id, old: d.fileUrl })),
    ...invoices.map((d) => ({ model: 'invoice' as const, id: d.id, old: d.pdfUrl! })),
  ].filter((i) => !i.old.includes('.private.blob.vercel-storage.com/'));
  console.log(
    `${items.length} legacy objects (including archives); ${apply ? 'applying' : 'dry run, no writes'}`,
  );
  if (!apply) return;
  for (const item of items) {
    const source = new URL(item.old);
    if (
      source.protocol !== 'https:' ||
      !source.hostname.endsWith('.blob.vercel-storage.com')
    )
      throw Error(`Unsupported source for ${item.model}/${item.id}; migrate it explicitly`);
    const response = await fetch(source, { redirect: 'error' });
    if (!response.ok) throw Error(`Cannot read ${item.model}/${item.id}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const blob = await put(`migrated/${item.model}/${item.id}.pdf`, bytes, {
      access: 'private',
      token: process.env.BLOB_PRIVATE_READ_WRITE_TOKEN,
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const check = await get(blob.url, {
      access: 'private',
      token: process.env.BLOB_PRIVATE_READ_WRITE_TOKEN,
      useCache: false,
    });
    if (!check || check.statusCode !== 200 || !check.stream)
      throw Error(`Cannot verify private copy ${item.id}`);
    const restored = new Uint8Array(await new Response(check.stream).arrayBuffer());
    if (!Buffer.from(bytes).equals(Buffer.from(restored))) throw Error(`Copy mismatch ${item.id}`);
    const entry: Item = { ...item, next: blob.url };
    appendFileSync(journal, JSON.stringify(entry) + '\n', { mode: 0o600 });
    await update(entry);
    console.log(`Migrated ${item.model}/${item.id}`);
  }
}
main().finally(() => db.$disconnect());
