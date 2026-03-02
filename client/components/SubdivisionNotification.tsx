import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, Info } from 'lucide-react';

interface SubdivisionNotificationProps {
  show: boolean;
  message: string;
  type?: 'info' | 'success' | 'warning';
  onDismiss?: () => void;
  autoHide?: boolean;
  duration?: number;
}

export function SubdivisionNotification({
  show,
  message,
  type = 'info',
  onDismiss,
  autoHide = false,
  duration = 3000
}: SubdivisionNotificationProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    setVisible(show);
    
    if (show && autoHide) {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [show, autoHide, duration, onDismiss]);

  if (!visible) return null;

  const bgColor = {
    info: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200', 
    warning: 'bg-yellow-50 border-yellow-200'
  }[type];

  const textColor = {
    info: 'text-blue-800',
    success: 'text-green-800',
    warning: 'text-yellow-800'
  }[type];

  return (
    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[1002] max-w-md w-full mx-4">
      <Alert className={`${bgColor} shadow-lg`}>
        <Info className={`h-4 w-4 ${textColor}`} />
        <AlertDescription className={`${textColor} pr-8`}>
          {message}
        </AlertDescription>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVisible(false);
              onDismiss();
            }}
            className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-transparent"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </Alert>
    </div>
  );
}
