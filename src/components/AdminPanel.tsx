/**
 * Admin Panel Component
 * Shows admin-only controls and statistics
 */

"use client";

import { Shield, Settings, Database, Timer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";

export function AdminPanel() {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-600" />
          Admin Panel
        </CardTitle>
        <CardDescription>
          Administrator controls and system management
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Button variant="outline" className="justify-start" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            System Settings
          </Button>
          <Button asChild variant="outline" className="justify-start" size="sm">
            <Link to="/admin/tournaments">
              <Database className="mr-2 h-4 w-4" />
              Tournaments
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start" size="sm">
            <Link to="/admin/setup">
              <Database className="mr-2 h-4 w-4" />
              League Setup
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start" size="sm">
            <Link to="/admin/teams">
              <Database className="mr-2 h-4 w-4" />
              Teams
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start" size="sm">
            <Link to="/admin/golfers">
              <Database className="mr-2 h-4 w-4" />
              Manage Golfers
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start" size="sm">
            <Link to="/admin/crons">
              <Timer className="mr-2 h-4 w-4" />
              Cron Test
            </Link>
          </Button>
          <Button variant="outline" className="justify-start" size="sm">
            <Shield className="mr-2 h-4 w-4" />
            View Audit Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
