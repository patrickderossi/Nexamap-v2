import { useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

interface DraggablePanelProps {
  children: ReactNode;
  className?: string;
  initialX?: number;
  initialY?: number;
  title?: string;
}

export function DraggablePanel({ 
  children, 
  className = "", 
  initialX = 20, 
  initialY = 80,
  title = "Panel"
}: DraggablePanelProps) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
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
    
    // Prevent text selection while dragging
    e.preventDefault();
  };

  // Throttled mouse move handler using requestAnimationFrame for better performance
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Keep panel within viewport bounds
    const maxX = window.innerWidth - 320; // Assuming panel width ~320px
    const maxY = window.innerHeight - 200; // Assuming min panel height ~200px

    const newPosition = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    };

    // Store pending position
    pendingPositionRef.current = newPosition;

    // Cancel previous animation frame if it exists
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule position update for next frame
    animationFrameRef.current = requestAnimationFrame(() => {
      if (pendingPositionRef.current) {
        setPosition(pendingPositionRef.current);
        pendingPositionRef.current = null;
      }
      animationFrameRef.current = null;
    });
  }, [isDragging, dragOffset.x, dragOffset.y]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';

        // Clean up any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [isDragging, handleMouseMove]);

  // Cleanup animation frame on unmount
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
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
    >
      {/* Drag Handle */}
      <div
        className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing rounded-t-lg"
        onMouseDown={handleMouseDown}
        title={`Drag to move ${title}`}
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-600 select-none">{title}</span>
        <div className="flex-1"></div>
        <div className="w-2 h-2 bg-green-400 rounded-full" title="Draggable panel"></div>
      </div>
      
      {/* Panel Content */}
      <div className="bg-white rounded-b-lg overflow-hidden">
        {children}
      </div>
    </div>
  );
}
