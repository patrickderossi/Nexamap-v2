import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  sendTestEmail,
  checkEmailStatus,
  sendFeedbackEmail,
  sendWelcomeEmailForSignup,
} from "@/lib/email-service";
import { Mail, Send, TestTube, CheckCircle } from "lucide-react";

export function EmailTester() {
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("Test Email from Nexamap");
  const [testMessage, setTestMessage] = useState(
    "This is a test email to verify the email service is working correctly.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<any>(null);

  const handleTestEmail = async () => {
    if (!testEmail || !testSubject || !testMessage) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      await sendTestEmail(testEmail, testSubject, testMessage);
      toast.success(
        "Test email sent successfully! Check console for preview link.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send test email",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestFeedback = async () => {
    setIsLoading(true);
    try {
      await sendFeedbackEmail({
        type: "analysis-tools",
        title: "Test Feedback Email",
        feedback:
          "This is a test feedback email to verify the feedback system is working correctly.",
        email: testEmail || "test@example.com",
        context: "Email testing via EmailTester component",
      });
      toast.success(
        "Test feedback email sent successfully! Check console for preview link.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send feedback email",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestWelcomeSignup = async () => {
    if (!testEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setIsLoading(true);
    try {
      await sendWelcomeEmailForSignup(testEmail, "Test User");
      toast.success(
        "Test welcome signup email sent successfully! Check console for preview link.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send welcome signup email",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsLoading(true);
    try {
      const status = await checkEmailStatus();
      setEmailStatus(status);
      toast.success("Email service status checked");
    } catch (error) {
      toast.error("Failed to check email status");
    } finally {
      setIsLoading(false);
    }
  };

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="w-5 h-5" />
          Email Service Tester
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email Status */}
        <div className="space-y-2">
          <Button
            onClick={handleCheckStatus}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Check Email Service Status
          </Button>

          {emailStatus && (
            <div className="text-xs p-2 bg-gray-50 rounded">
              <p>
                <strong>Configured:</strong> {emailStatus.configured ? "Yes" : "No"}
              </p>
              <p>
                <strong>Service:</strong> {emailStatus.service}
              </p>
              <p>
                <strong>From:</strong> {emailStatus.from}
              </p>
            </div>
          )}
        </div>

        {/* Test Email Form */}
        <div className="space-y-2">
          <Input
            placeholder="Test email address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            type="email"
          />
          <Input
            placeholder="Subject"
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
          />
          <Textarea
            placeholder="Message"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            rows={3}
          />
        </div>

        {/* Test Buttons */}
        <div className="space-y-2">
          <Button
            onClick={handleTestEmail}
            disabled={isLoading}
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            Send Test Email
          </Button>

          <Button
            onClick={handleTestFeedback}
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            <Mail className="w-4 h-4 mr-2" />
            Test Feedback Email
          </Button>

          <Button
            onClick={handleTestWelcomeSignup}
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            <Mail className="w-4 h-4 mr-2" />
            Test Welcome (Signup)
          </Button>
        </div>

        <div className="text-xs text-gray-500 p-2 bg-blue-50 rounded">
          💡 <strong>Tip:</strong> Check browser console for email preview links
          when using test emails
        </div>
      </CardContent>
    </Card>
  );
}
