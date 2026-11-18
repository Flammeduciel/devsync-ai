import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateTeamForm } from '@/features/teams/create-team-form';

export const metadata: Metadata = { title: 'Create a team' };

export default function OnboardingPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create your team</CardTitle>
          <CardDescription>
            A team groups developers, their agents and projects. Data never crosses team boundaries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTeamForm />
        </CardContent>
      </Card>
    </main>
  );
}
