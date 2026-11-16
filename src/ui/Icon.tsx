/* Иконки — набор Lucide (lucide.dev, лицензия ISC): единый стиль, линия 2px, сетка 24×24.
   Имена — прежние, поэтому компоненты не меняются; в сборку попадают только используемые иконки. */
import type { SVGProps } from 'react';
import {
  Archive,
  AudioLines,
  BookDown,
  BookOpen,
  BookOpenText,
  Calendar,
  Check,
  EllipsisVertical,
  RefreshCw,
  ScanFace,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Folder,
  Globe,
  Grid3x3,
  Heart,
  Image,
  Info,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Moon,
  Network,
  PenLine,
  Play,
  Plus,
  Save,
  Scan,
  Search,
  ShieldCheck,
  Square,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
  Video,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  plus: Plus,
  minus: Minus,
  layout: WandSparkles, // «Выровнять» — автоматически расставить по поколениям
  sun: Sun,
  moon: Moon,
  folder: Folder,
  download: Download,
  upload: Upload,
  target: Scan, // «Показать всё дерево»
  x: X,
  edit: PenLine,
  trash: Trash2,
  user: User,
  image: Image,
  users: Users,
  book: BookOpen,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  heart: Heart,
  link: Link2,
  pin: MapPin,
  search: Search,
  eye: Eye,
  dots: Grid3x3,
  'dots-off': Square,
  tree: Network,
  video: Video,
  audio: AudioLines,
  file: FileText,
  lock: Lock,
  unlock: LockOpen,
  save: Save,
  story: BookOpenText,
  play: Play,
  key: KeyRound,
  logout: LogOut,
  info: Info,
  globe: Globe,
  'book-pdf': BookDown,
  menu: Menu,
  archive: Archive,
  calendar: Calendar,
  check: Check,
  'more-v': EllipsisVertical,
  refresh: RefreshCw,
  'scan-face': ScanFace,
  shield: ShieldCheck,
};

export type IconName = string;

export function Icon({ name, size, className = 'i', ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  const style = size ? { width: size, height: size, ...rest.style } : rest.style;
  return (
    <Cmp
      className={className}
      aria-hidden="true"
      strokeWidth={2}
      {...(name === 'play' ? { fill: 'currentColor' } : null)}
      {...(rest as object)}
      style={style}
    />
  );
}
