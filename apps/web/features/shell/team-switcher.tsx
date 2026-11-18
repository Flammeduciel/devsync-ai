'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TeamSwitcher({
  current,
  teams,
}: {
  current: string;
  teams: { slug: string; name: string }[];
}) {
  const currentTeam = teams.find((t) => t.slug === current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm font-medium hover:bg-accent">
        <span className="truncate">{currentTeam?.name ?? 'Select a team'}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Teams</DropdownMenuLabel>
        {teams.map((team) => (
          <DropdownMenuItem key={team.slug} asChild>
            <Link href={`/t/${team.slug}` as never}>
              <span className="truncate">{team.name}</span>
              {team.slug === current ? <Check className="ml-auto size-4" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus className="size-4" /> New team
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
