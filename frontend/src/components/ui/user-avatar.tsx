import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback } from "./avatar";

type Props = {
  className?: string;
};

export function UserAvatar({ className }: Props) {
  return (
    <Avatar className={cn(className)}>
      <AvatarFallback className="bg-muted text-muted-foreground">
        <UserRound className="h-4 w-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
