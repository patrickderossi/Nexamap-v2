import React, { ReactNode } from "react";

interface PropertyCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

function PropertyCardComponent({ title, icon, children, className = "" }: PropertyCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 text-nexamap-500">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

// Memoize PropertyCard since props don't change frequently
export const PropertyCard = React.memo(PropertyCardComponent);

interface PropertyItemProps {
  label: string;
  value: string;
  status?: 'normal' | 'warning' | 'danger';
}

function PropertyItemComponent({ label, value, status = 'normal' }: PropertyItemProps) {
  const statusStyles = {
    normal: {
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-900',
      label: 'text-gray-500'
    },
    warning: {
      bg: 'bg-orange-50 border-orange-200',
      text: 'text-orange-700',
      label: 'text-orange-600'
    },
    danger: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      label: 'text-red-600'
    }
  };

  const styles = statusStyles[status];

  return (
    <div className={`${styles.bg} rounded-lg p-2 border`}>
      <div className={`text-xs font-medium ${styles.label} uppercase tracking-wide mb-0.5`}>{label}</div>
      <div className={`font-semibold text-sm ${styles.text}`}>
        {value}
      </div>
    </div>
  );
}

// Memoize PropertyItem since it re-renders frequently with same data
export const PropertyItem = React.memo(PropertyItemComponent);
