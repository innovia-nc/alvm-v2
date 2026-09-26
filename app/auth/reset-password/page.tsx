'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') ?? ''); }, []);
  const request = trpc.account.requestReset.useMutation();
  const reset = trpc.account.reset.useMutation();
  const done = request.isSuccess || reset.isSuccess;
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Réinitialiser le mot de passe</h1>
    {done ? <p role="status">{reset.isSuccess ? 'Mot de passe modifié. Vous pouvez vous connecter.' : 'Si ce compte est actif, un lien valable 30 minutes a été envoyé.'}</p> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); if (token) reset.mutate({ token, password: String(data.get('password')) }); else request.mutate({ email: String(data.get('email')) }); }}>
      {token ? <label>Nouveau mot de passe<Input name="password" type="password" minLength={8} required autoComplete="new-password" /><span className="text-sm">8 caractères minimum, majuscule, minuscule et chiffre.</span></label> : <label>Email<Input name="email" type="email" required autoComplete="email" /></label>}
      {(request.error || reset.error) && <p role="alert">{request.error?.message ?? reset.error?.message}</p>}
      <Button disabled={request.isPending || reset.isPending}>{token ? 'Changer le mot de passe' : 'Recevoir le lien'}</Button>
    </form>}
    <Link className="block underline" href="/auth/signin">Retour à la connexion</Link>
  </div>;
}
