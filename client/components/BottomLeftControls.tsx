import React from "react";
import { User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BottomLeftControlsProps {}

function BottomLeftControlsComponent({}: BottomLeftControlsProps) {
  return (
    <div className="fixed bottom-6 left-6 z-[1000]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center space-x-2 bg-white shadow-lg border-gray-200 hover:bg-gray-50"
          >
            <User className="w-4 h-4" />
            <Settings className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-48 mb-2">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Help</DropdownMenuItem>
          <DropdownMenuItem>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Memoize component since it rarely changes
export const BottomLeftControls = React.memo(BottomLeftControlsComponent);
