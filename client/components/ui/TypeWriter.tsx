import React, { useState, useEffect } from "react";

interface TypeWriterProps {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export function TypeWriter({ 
  text, 
  delay = 1000, 
  speed = 100, 
  className = "",
  onComplete 
}: TypeWriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    // Start typing after delay
    timeoutId = setTimeout(() => {
      setIsTyping(true);
      let index = 0;

      intervalId = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1));
          index++;
        } else {
          clearInterval(intervalId);
          setIsTyping(false);
          onComplete?.();
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [text, delay, speed, onComplete]);

  return (
    <span className={className}>
      {displayText}
      {isTyping && (
        <span className="animate-pulse ml-1">|</span>
      )}
    </span>
  );
}
