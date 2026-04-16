'use client';

import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow/types';
import TriggerPicker, { type TriggerType } from './TriggerPicker';
import TriggerConfig, { type TriggerConfigData } from './TriggerConfig';
import StepList from './StepList';
import WorkflowReview from './WorkflowReview';

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Trigger',
  2: 'Configure',
  3: 'Steps',
  4: 'Review',
};

interface WorkflowBuilderProps {
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
  initial?: {
    id?: string;
    name?: string;
    description?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    steps?: WorkflowStep[];
    enabled?: boolean;
  };
}

export default function WorkflowBuilder({
  workspaceId,
  onClose,
  onSaved,
  initial,
}: WorkflowBuilderProps) {
  // If editing an existing workflow start at step 3
  const startStep: WizardStep = initial?.id ? 3 : 1;

  const [currentStep, setCurrentStep] = useState<WizardStep>(startStep);
  const [triggerType, setTriggerType] = useState<TriggerType>(
    (initial?.triggerType as TriggerType) ?? 'shortcut'
  );
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigData>({
    triggerType: initial?.triggerType ?? 'manual',
    triggerConfig: initial?.triggerConfig ?? {},
  });
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? []);
  const [name, setName] = useState(initial?.name ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleTriggerSelect(type: TriggerType) {
    setTriggerType(type);
    setCurrentStep(2);
  }

  function handleTriggerConfigContinue(data: TriggerConfigData) {
    setTriggerConfig(data);
    setCurrentStep(3);
  }

  async function saveWorkflow(enabled: boolean) {
    setSaveError(null);

    const body = {
      name: name.trim(),
      description: null as string | null,
      triggerType: triggerConfig.triggerType ?? 'manual',
      triggerConfig: triggerConfig.triggerConfig ?? {},
      steps,
      workspaceId,
      enabled,
    };

    const url = initial?.id ? `/api/workflows/${initial.id}` : '/api/workflows';
    const method = initial?.id ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Failed to save workflow');
    }
  }

  async function handlePublish() {
    try {
      await saveWorkflow(true);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function handleSaveDraft() {
    try {
      await saveWorkflow(false);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  const stepNums: WizardStep[] = [1, 2, 3, 4];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            {stepNums.map((n, i) => (
              <div key={n} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // allow navigating back to completed steps
                    if (n < currentStep) setCurrentStep(n);
                  }}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                    n === currentStep
                      ? 'bg-[#4a154b] text-white'
                      : n < currentStep
                      ? 'text-slate-300 hover:text-white cursor-pointer'
                      : 'text-slate-600 cursor-default'
                  }`}
                  disabled={n > currentStep}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                    n === currentStep ? 'bg-white/20' : n < currentStep ? 'bg-green-500/20 text-green-400' : 'bg-white/5'
                  }`}>
                    {n < currentStep ? '✓' : n}
                  </span>
                  {STEP_LABELS[n]}
                </button>
                {i < stepNums.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors ml-4"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStep === 1 && (
            <TriggerPicker onSelect={handleTriggerSelect} />
          )}
          {currentStep === 2 && (
            <TriggerConfig
              triggerType={triggerType}
              onContinue={handleTriggerConfigContinue}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && (
            <StepList
              steps={steps}
              onChange={setSteps}
              onContinue={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(initial?.id ? 1 : 2)}
            />
          )}
          {currentStep === 4 && (
            <WorkflowReview
              name={name}
              onNameChange={setName}
              triggerType={triggerType}
              triggerConfig={triggerConfig}
              steps={steps}
              onPublish={handlePublish}
              onSaveDraft={handleSaveDraft}
              onBack={() => setCurrentStep(3)}
              error={saveError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
