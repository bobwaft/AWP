import { ThemesPanel } from '../components/ThemesPanel';
import { SpecStageView } from './IdeationView';

export const DesignView = () => (
  <SpecStageView
    stage="design"
    extra={{ label: 'Themes', node: (snap) => <ThemesPanel snap={snap} /> }}
  />
);
