'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LAST_ORGANIZATION_KEY, normalizeOrganizationSlug } from '@/lib/organization-slug';

/**
 * Récupération de compte.
 *
 * Demande : un compte est identifié par (espace, email) — sauf sur le portail
 * super admin (`?portal=super-admin`). Réinitialisation : le lien reçu
 * (`?token=`) suffit.
 */
export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [superAdmin, setSuperAdmin] = useState(false);
  const [organization, setOrganization] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
    setSuperAdmin(params.get('portal') === 'super-admin');
    let remembered = '';
    try {
      remembered = window.localStorage.getItem(LAST_ORGANIZATION_KEY) ?? '';
    } catch {
      // Stockage indisponible : l'utilisateur saisit son espace.
    }
    setOrganization(normalizeOrganizationSlug(params.get('org') ?? remembered));
  }, []);
  const request = trpc.account.requestReset.useMutation();
  const reset = trpc.account.reset.useMutation();
  const done = request.isSuccess || reset.isSuccess;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (token) {
      reset.mutate({ token, password: String(data.get('password')) });
      return;
    }
    const email = String(data.get('email'));
    request.mutate(
      superAdmin
        ? { portal: 'super-admin', email }
        : {
            portal: 'standard',
            organization: normalizeOrganizationSlug(String(data.get('organization'))),
            email,
          },
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Réinitialiser le mot de passe</h1>
      {done ? (
        <p role="status">
          {reset.isSuccess
            ? 'Mot de passe modifié. Vous pouvez vous connecter.'
            : 'Si ce compte est actif, un lien valable 30 minutes a été envoyé.'}
        </p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {token ? (
            <label className="block space-y-1">
              Nouveau mot de passe
              <Input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
              <span className="text-sm">
                8 caractères minimum, majuscule, minuscule et chiffre.
              </span>
            </label>
          ) : (
            <>
              {!superAdmin && (
                <label className="block space-y-1">
                  Identifiant de l’espace
                  <Input
                    name="organization"
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="mon-association"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                  />
                </label>
              )}
              <label className="block space-y-1">
                Email
                <Input name="email" type="email" required autoComplete="email" />
              </label>
            </>
          )}
          {(request.error || reset.error) && (
            <p role="alert">{request.error?.message ?? reset.error?.message}</p>
          )}
          <Button disabled={request.isPending || reset.isPending}>
            {token ? 'Changer le mot de passe' : 'Recevoir le lien'}
          </Button>
        </form>
      )}
      <Link className="block underline" href={superAdmin ? '/auth/super-admin' : '/auth/signin'}>
        Retour à la connexion
      </Link>
    </div>
  );
}
