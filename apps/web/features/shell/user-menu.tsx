'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';

export function UserMenu({ name, email, platformAdmin = false }: { name: string; email: string; platformAdmin?: boolean }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent">
        <Avatar name={name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        {platformAdmin ? (
          <DropdownMenuItem asChild>
            <a href="/admin">Platform admin</a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.replace('/sign-in');
            router.refresh();
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
