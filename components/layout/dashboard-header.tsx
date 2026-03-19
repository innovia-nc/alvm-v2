'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Settings, LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

export function DashboardHeader() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { data: session, status } = useSession();

  // Récupérer info utilisateur depuis session
  const user = React.useMemo(() => {
    if (status === 'loading' || !session?.user) return null;

    const email = session.user.email || '';
    const name = session.user.name || email.split('@')[0] || 'Utilisateur';
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return { email, name, initials };
  }, [session, status]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push('/auth/signin');
    router.refresh();
  };

  // Afficher un skeleton pendant le chargement de la session
  if (status === 'loading') {
    return (
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex-1"></div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse"></div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex-1"></div>

        {/* Actions header */}
        <div className="flex items-center gap-2">
          {/* Toggle theme */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Changer le thème</span>
          </Button>

          {/* Menu utilisateur */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.initials || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                <User className="mr-2 h-4 w-4" />
                <span>Mon Profil</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Paramètres</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
