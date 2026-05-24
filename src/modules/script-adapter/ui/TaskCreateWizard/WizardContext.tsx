import { createContext, useContext } from 'react';
import { WizardStep, CreationRangeMode } from './index'; 
import { IntakeResult, AnalysisReport } from '../../services/mockTaskIntake'; 
import { LibraryBook, LibraryChapter } from '../../services/aiLibraryClient';

export interface WizardContextType {
  activeStep: WizardStep;
  setActiveStep: (step: WizardStep) => void;
  intakeResult: IntakeResult | null;
  setIntakeResult: (result: IntakeResult | null) => void;
  analysisReport: AnalysisReport | null;
  setAnalysisReport: (report: AnalysisReport | null) => void;
  decisionOverrides: Record<string, { value: string; desc: string; customNote: string }>;
  setDecisionOverrides: (overrides: Record<string, { value: string; desc: string; customNote: string }>) => void;
  editingDecisionId: string | null;
  setEditingDecisionId: (id: string | null) => void;
  updateDecision: (itemId: string, value: string, desc: string) => void;
  updateDecisionNote: (itemId: string, customNote: string) => void;

  // useWizardSource states and helpers shared via context for step components
  sourceMode: 'library' | 'upload' | 'paste';
  setSourceMode: (mode: 'library' | 'upload' | 'paste') => void;
  libraryBooks: LibraryBook[];
  libraryChapters: LibraryChapter[];
  selectedBookId: string;
  setSelectedBookId: (id: string) => void;
  selectedChapterIndex: number | '';
  setSelectedChapterIndex: (index: number | '') => void;
  selectedRangeMode: CreationRangeMode;
  setSelectedRangeMode: (mode: CreationRangeMode) => void;
  selectedRangeEndIndex: number | '';
  setSelectedRangeEndIndex: (index: number | '') => void;
  chapterPreview: string;
  libraryStatus: 'idle' | 'loading-books' | 'loading-chapters' | 'loading-preview';
  libraryError: string;
  setLibraryError: (err: string) => void;
  uploadFilePath: string;
  setUploadFilePath: (path: string) => void;
  uploadTitle: string;
  setUploadTitle: (title: string) => void;
  uploadAuthor: string;
  setUploadAuthor: (author: string) => void;
  uploadingBook: boolean;
  setUploadingBook: (uploading: boolean) => void;
  pastedText: string;
  setPastedText: (text: string) => void;
  selectedBook: LibraryBook | null;
  selectedChapter: LibraryChapter | null;
  selectedRangeChapters: LibraryChapter[];
  selectedRangeTotalChars: number;
  selectedRangeLabel: string;
  sourceReady: boolean;
}

export const WizardContext = createContext<WizardContextType | null>(null);

export const useWizardContext = () => {
  const context = useContext(WizardContext);
  if (!context) throw new Error('useWizardContext must be used within WizardProvider');
  return context;
};
