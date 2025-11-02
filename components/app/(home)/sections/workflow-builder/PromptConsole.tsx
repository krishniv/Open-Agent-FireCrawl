import { useState } from 'react';
import { motion } from 'framer-motion';

interface PromptConsoleProps {
  onSubmit: (prompt: string) => void;
  isLoading?: boolean;
}

export default function PromptConsole({ onSubmit, isLoading = false }: PromptConsoleProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt.trim());
      // Keep the prompt text - don't clear it
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-t border-border-faint bg-accent-white flex-shrink-0 p-16"
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-accent-white border border-border-faint rounded-12 shadow-xl p-16"
      >
        <div className="flex items-center gap-12">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the workflow you want to build..."
            className="flex-1 bg-transparent border-none text-body-medium text-accent-black placeholder:text-black-alpha-40 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="px-16 py-8 bg-heat-100 hover:bg-heat-200 disabled:bg-black-alpha-8 text-white rounded-8 text-body-medium font-medium transition-all active:scale-[0.98] flex items-center gap-8"
          >
            {isLoading ? (
              <span className="flex items-center gap-8">
                <svg className="animate-spin w-16 h-16" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Building...
              </span>
            ) : (
              'Build Workflow'
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
}