import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageSquarePlus, Send, Loader2 } from "lucide-react";
import { sendFeedbackEmail } from "@/lib/email-service";

interface FeedbackModalProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  feedbackType: "lot-data" | "map-layers" | "analysis-tools";
  context?: string; // Additional context like selected parcel, layer info, etc.
}

export function FeedbackModal({
  trigger,
  title,
  description,
  placeholder,
  feedbackType,
  context
}: FeedbackModalProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    setIsSubmitting(true);

    try {
      // Send feedback email using the email service
      await sendFeedbackEmail({
        type: feedbackType,
        title,
        feedback,
        email,
        context
      });

      toast.success("Feedback sent successfully! Thank you for helping improve Nexamap.");
      
      // Reset form
      setFeedback("");
      setEmail("");
      setOpen(false);

    } catch (error) {
      console.error("Failed to send feedback:", error);
      toast.error("Failed to send feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-nexamap-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              We may contact you for follow-up questions
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback">Your Suggestion *</Label>
            <Textarea
              id="feedback"
              placeholder={placeholder}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[120px] w-full"
              required
            />
          </div>

          {context && (
            <div className="bg-gray-50 p-3 rounded-md">
              <Label className="text-xs font-medium text-gray-600">Context Info:</Label>
              <p className="text-xs text-gray-500 mt-1">{context}</p>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !feedback.trim()}
              className="bg-nexamap-600 hover:bg-nexamap-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Feedback
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Cool feedback button component
interface FeedbackButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
}

export const FeedbackButton = React.forwardRef<HTMLButtonElement, FeedbackButtonProps>(
  ({ children, className = "", variant = "outline" }, ref) => {
    const baseStyles = "inline-flex items-center gap-2 text-xs font-medium rounded-md px-3 py-1.5 transition-all duration-200 hover:scale-105 active:scale-95";

    const variantStyles = {
      primary: "bg-gradient-to-r from-nexamap-500 to-nexamap-600 text-white shadow-sm hover:from-nexamap-600 hover:to-nexamap-700",
      secondary: "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm hover:from-blue-600 hover:to-blue-700",
      outline: "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-nexamap-400 hover:text-nexamap-600"
    };

    return (
      <button ref={ref} className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
        <MessageSquarePlus className="w-3 h-3" />
        {children}
      </button>
    );
  }
);

FeedbackButton.displayName = "FeedbackButton";
