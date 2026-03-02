import { useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { GripVertical, Minus, Plus, X } from 'lucide-react';

interface DraggablePanelProps {
  children: ReactNode;
  className?: string;
  initialX?: number;
  initialY?: number;
  title?: string;
  onClose?: () => void;
  minimizable?: boolean;
  defaultMinimized?: boolean;
}

export function DraggablePanel({ 
  children, 
  className = "", 
  initialX = 20, 
  initialY = 80,
  title = "Panel",
  onClose,
  minimizable = true,
  defaultMinimized = false,
}: DraggablePanelProps) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current) return;
    
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!panelRef.current || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
  };

  const clampPosition = useCallback((x: number, y: number) => {
    const panelWidth = panelRef.current?.offsetWidth || 320;
    const maxX = window.innerWidth - 40;
    const maxY = window.innerHeight - 40;
    return {
      x: Math.max(-panelWidth + 40, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newPosition = clampPosition(
      e.clientX - dragOffset.x,
      e.clientY - dragOffset.y
    );

    pendingPositionRef.current = newPosition;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      if (pendingPositionRef.current) {
        setPosition(pendingPositionRef.current);
        pendingPositionRef.current = null;
      }
      animationFrameRef.current = null;
    });
  }, [isDragging, dragOffset.x, dragOffset.y, clampPosition]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const newPosition = clampPosition(
      touch.clientX - dragOffset.x,
      touch.clientY - dragOffset.y
    );

    pendingPositionRef.current = newPosition;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      if (pendingPositionRef.current) {
        setPosition(pendingPositionRef.current);
        pendingPositionRef.current = null;
      }
      animationFrameRef.current = null;
    });
  }, [isDragging, dragOffset.x, dragOffset.y, clampPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleMouseUp);
        document.body.style.userSelect = '';

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className={`absolute z-[1002] ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'auto',
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
      }}
    >
      <div
        className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing rounded-t-lg select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        title={`Drag to move ${title}`}
      >
        <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-600 select-none truncate">{title}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {minimizable && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? (
                <Plus className="h-3 w-3 text-gray-500" />
              ) : (
                <Minus className="h-3 w-3 text-gray-500" />
              )}
            </button>
          )}
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 rounded hover:bg-red-100 transition-colors"
              title="Close"
            >
              <X className="h-3 w-3 text-gray-500 hover:text-red-500" />
            </button>
          )}
        </div>
      </div>
      
      <div
        className={`bg-white overflow-hidden transition-all duration-200 ${
          isMinimized ? 'max-h-0' : 'max-h-[80vh]'
        }`}
        style={{
          borderBottomLeftRadius: '0.5rem',
          borderBottomRightRadius: '0.5rem',
        }}
      >
        {!isMinimized && children}
      </div>
    </div>
  );
}
