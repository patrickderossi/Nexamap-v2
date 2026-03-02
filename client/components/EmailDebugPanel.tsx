import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkEmailStatus, sendTestEmail, sendContactEmail, sendFeedbackEmail } from "@/lib/email-service";
import { toast } from "sonner";
import { Mail, Send, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface EmailStatus {
  configured: boolean;
  service: string;
  from: string;
  debug?: {
    smtpHost?: string;
    smtpPort?: string;
    smtpSecure?: boolean;
  };
}

export function EmailDebugPanel() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  // Test form data
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("Test Email from NexaMap");
  const [testMessage, setTestMessage] = useState("This is a test email to verify the email service is working correctly.");

  useEffect(() => {
    loadEmailStatus();
  }, []);

  const loadEmailStatus = async () => {
    setLoading(true);
    try {
      const emailStatus = await checkEmailStatus();
      setStatus(emailStatus);
    } catch (error) {
      console.error("Failed to load email status:", error);
      toast.error("Failed to load email status");
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !testSubject || !testMessage) {
      toast.error("Please fill in all test email fields");
      return;
    }

    setTestLoading(true);
    try {
      await sendTestEmail(testEmail, testSubject, testMessage);
      toast.success("Test email sent successfully!");
    } catch (error) {
      console.error("Test email failed:", error);
      toast.error(`Test email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestContact = async () => {
    setTestLoading(true);
    try {
      await sendContactEmail({
        name: "Test User",
        email: testEmail || "test@example.com",
        company: "Test Company",
        message: "This is a test contact form submission to verify the email service."
      });
      toast.success("Test contact form sent successfully!");
    } catch (error) {
      console.error("Test contact failed:", error);
      toast.error(`Test contact failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestFeedback = async () => {
    setTestLoading(true);
    try {
      await sendFeedbackEmail({
        type: "analysis-tools",
        title: "Test Feedback",
        feedback: "This is a test feedback submission to verify the email service.",
        email: testEmail || "test@example.com",
        context: "Email Debug Panel Test"
      });
      toast.success("Test feedback sent successfully!");
    } catch (error) {
      console.error("Test feedback failed:", error);
      toast.error(`Test feedback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (!status) return <XCircle className="w-5 h-5 text-red-500" />;
    if (status.configured) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusBadge = () => {
    if (loading) return <Badge variant="secondary">Loading...</Badge>;
    if (!status) return <Badge variant="destructive">Error</Badge>;
    if (status.configured) return <Badge variant="default" className="bg-green-600">Configured</Badge>;
    return <Badge variant="secondary">Test Mode</Badge>;
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Service Debug Panel
        </CardTitle>
        <CardDescription>
          Test and debug the email service configuration for contact and feedback forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Service Status</h3>
            <Button onClick={loadEmailStatus} variant="outline" size="sm" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className="font-medium">Status:</span>
                {getStatusBadge()}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-medium">Service:</span>
                <span className="text-sm text-gray-600">{status.service}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-medium">From Address:</span>
                <span className="text-sm text-gray-600">{status.from}</span>
              </div>
              
              {status.debug && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">SMTP Host:</span>
                  <span className="text-sm text-gray-600">{status.debug.smtpHost}</span>
                </div>
              )}
            </div>
          )}
          
          {status && !status.configured && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                <strong>Test Mode:</strong> No SMTP configuration found. Emails will be sent to Ethereal test service. 
                Set SMTP environment variables for production use.
              </p>
            </div>
          )}
        </div>

        {/* Test Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Test Email Sending</h3>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="test-email">Your Email Address</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="test-subject">Subject</Label>
              <Input
                id="test-subject"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="test-message">Message</Label>
              <Textarea
                id="test-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleTestEmail} 
              disabled={testLoading || !testEmail}
              size="sm"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Test Direct Email
            </Button>
            
            <Button 
              onClick={handleTestContact} 
              disabled={testLoading}
              variant="outline"
              size="sm"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Test Contact Form
            </Button>
            
            <Button 
              onClick={handleTestFeedback} 
              disabled={testLoading}
              variant="outline"
              size="sm"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Test Feedback Form
            </Button>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Need Help?</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Check the browser console for detailed error messages</li>
            <li>• See <code>QUICK_EMAIL_FIX.md</code> for easy setup instructions</li>
            <li>• See <code>EMAIL_TROUBLESHOOTING.md</code> for detailed troubleshooting</li>
            <li>• The system has automatic fallback to user's email client if SMTP fails</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmailDebugPanel;
