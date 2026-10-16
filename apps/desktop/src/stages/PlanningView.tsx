import { PlanPanel } from '../components/PlanPanel';
import { SpecStageView } from './IdeationView';

export const PlanningView = () => (
  <SpecStageView
    stage="planning"
    extra={{ label: 'Plan', node: (snap) => <PlanPanel snap={snap} /> }}
  />
);
