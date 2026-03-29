import { FormEvent, useState } from "react";
import { Copy, Link2 } from "lucide-react";

import type { UserRole } from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvitationsManagement } from "@/features/invitations/use-invitations-management";

export function InvitationsPage() {
  const { items, loading, createInvitation, copyInvitationToken, copyInvitationLink } = useInvitationsManagement();
  const [email, setEmail] = useState("new.user@example.com");
  const [role, setRole] = useState<UserRole>("member");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [latestInvitationToken, setLatestInvitationToken] = useState("");
  const [latestInvitationEmail, setLatestInvitationEmail] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const created = await createInvitation({
      email: email.trim(),
      role,
      expires_in_hours: Number(expiresInHours),
    });
    if (created) {
      setLatestInvitationToken(created.token);
      setLatestInvitationEmail(created.email);
      setEmail("");
      setRole("member");
      setExpiresInHours("72");
    }
  };

  return (
    <PageShell
      title="Invitations"
      description="Invite new users with role-scoped access and expiration windows."
    >
      <SectionCard title="Create Invitation" description="Issue one-time onboarding credentials for new team members.">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="staff">staff</SelectItem>
                <SelectItem value="member">member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Expires in hours</Label>
            <Input value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit">Create</Button>
          </div>
        </form>

        {latestInvitationToken ? (
          <div className="mt-4 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
            <p className="font-medium">Latest invitation created for {latestInvitationEmail}</p>
            <p className="mt-1 text-muted-foreground">
              The raw token is only shown now. Copy and distribute it securely.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => copyInvitationToken(latestInvitationToken)}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy token
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => copyInvitationLink(latestInvitationToken)}
              >
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Copy link
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Active Invitations" description="Track invitation status with masked token hints.">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading invitations...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Token hint</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.role}</TableCell>
                  <TableCell className="font-mono text-xs">{invitation.token_hint ?? "-"}</TableCell>
                  <TableCell>
                    {invitation.accepted_at ? <Badge>Accepted</Badge> : <Badge variant="muted">Pending</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </PageShell>
  );
}
