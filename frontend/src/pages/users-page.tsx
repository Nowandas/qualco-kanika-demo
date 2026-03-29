import { Link2 } from "lucide-react";

import type { UserRole } from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUsersManagement } from "@/features/users/use-users-management";
import { avatarUrl } from "@/lib/avatar";

export function UsersPage() {
  const { users, loading, updateRole, toggleActive, generatePasswordResetLink } = useUsersManagement();

  return (
    <PageShell
      title="Users"
      description="Manage account roles, activation status, and password-reset links."
    >
      <SectionCard
        title="User Management"
        description="The bootstrap admin is protected from role downgrade and disable operations by backend policy."
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={avatarUrl(user.avatar_seed, user.avatar_style)} />
                        <AvatarFallback>{user.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={user.role} onValueChange={(value) => updateRole(user, value as UserRole)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="staff">staff</SelectItem>
                        <SelectItem value="member">member</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.is_active ? <Badge>Active</Badge> : <Badge variant="danger">Disabled</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => generatePasswordResetLink(user)}>
                        <Link2 className="mr-1 h-3.5 w-3.5" />
                        Reset link
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => toggleActive(user)}>
                        {user.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
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
