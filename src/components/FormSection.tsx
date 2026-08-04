import React, { useRef, useEffect, useState } from 'react';
import type { FormSection as FormSectionType } from '@/types';

interface FormSectionProps {
  section: FormSectionType;
  children: React.ReactNode;
  isActive?: boolean;
  onToggle?: () => void;
}

const FormSectionComponent: React.FC<FormSectionProps> = ({
  section,
  children,
  isActive: isActiveProp = false,
  onToggle,
}) => {
  // If collapsedByDefault, start collapsed unless explicitly active
  const isActive = section.collapsedByDefault ? isActiveProp : isActiveProp;
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(isActive ? 'none' : '0px');

  useEffect(() => {
    if (isActive) {
      if (contentRef.current) {
        setMaxHeight(contentRef.current.scrollHeight + 'px');
        // After transition, set to 'none' so dynamic content doesn't get clipped
        const timer = setTimeout(() => setMaxHeight('none'), 300);
        return () => clearTimeout(timer);
      }
    } else {
      // First set explicit height for transition to work
      if (contentRef.current) {
        setMaxHeight(contentRef.current.scrollHeight + 'px');
        requestAnimationFrame(() => {
          setMaxHeight('0px');
        });
      }
    }
  }, [isActive]);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-shadow ${
        isActive ? 'border-indigo-200 shadow-sm' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={isActive}
      >
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {section.title}
            {section.collapsedByDefault && (
              <span className="ml-2 text-xs font-normal bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                可选
              </span>
            )}
          </h3>
          {section.description && (
            <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
            isActive ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        ref={contentRef}
        style={{ maxHeight, overflow: isActive ? 'visible' : 'hidden' }}
        className="transition-[max-height] duration-300 ease-in-out"
      >
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
};

export default FormSectionComponent;
