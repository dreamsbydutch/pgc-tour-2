/**
 * Moderator Tools Component
 * Shows moderator controls for content management
 */

"use client";

import { Edit, Trophy, Target } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";

export function ModeratorTools() {
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="h-5 w-5 text-blue-600" />
          Moderator Tools
        </CardTitle>
        <CardDescription>
          Content management and tournament operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Button variant="outline" className="justify-start" size="sm">
            <Trophy className="mr-2 h-4 w-4" />
            Manage Tournaments
          </Button>
          <Button variant="outline" className="justify-start" size="sm">
            <Target className="mr-2 h-4 w-4" />
            Update Golfers
          </Button>
          <Button variant="outline" className="justify-start" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Tournament Results
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
