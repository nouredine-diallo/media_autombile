/**
 * Jeu d'icônes unique du Dashboard — lucide-react (ISC, zéro dépendance).
 *
 * Pourquoi un point d'entrée unique :
 * - une seule épaisseur de trait et une seule famille de formes dans tout l'outil ;
 * - changer une icône se fait ici, pas dans dix fichiers ;
 * - AUCUN emoji dans l'interface : les glyphes emoji sont des bitmaps rendus
 *   différemment selon le système (Noto sur Linux, Apple Color Emoji sur macOS),
 *   ils pixellisent dès qu'on les agrandit et cassent la cohérence visuelle.
 */
export {
  // Navigation
  LayoutDashboard as IconHome,
  Radar as IconVeille,
  CheckCircle2 as IconReady,
  PenLine as IconCorrections,
  PenLine as IconPenLine,
  BookOpen as IconGuide,
  BarChart3 as IconStats,
  CalendarCheck as IconCalendarCheck,
  Calendar as IconCalendar,
  Handshake as IconPartners,
  Palette as IconStudio,
  FolderOpen as IconDrive,
  PanelLeft as IconPanelToggle,
  ArrowUpRight as IconExternal,
  ArrowRight as IconArrowRight,
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,

  // États / statuts
  AlertTriangle as IconWarning,
  AlertCircle as IconAlert,
  Info as IconInfo,
  Check as IconCheck,
  X as IconClose,
  Zap as IconUrgent,
  Clock as IconClock,
  CircleDot as IconDot,
  Loader2 as IconSpinner,

  // Actions
  Play as IconRun,
  RefreshCw as IconRefresh,
  Sparkles as IconGenerate,
  Plus as IconPlus,
  Download as IconDownload,
  Upload as IconUpload,
  Search as IconSearch,
  Trash2 as IconTrash,
  Eye as IconEye,

  // Contenu / fichiers
  Image as IconImage,
  ImageOff as IconImageOff,
  Camera as IconCamera,
  FileText as IconFile,
  FileType2 as IconFileDoc,
  FileSpreadsheet as IconFileSheet,
  FileArchive as IconFileZip,
  Presentation as IconFileSlides,
  Film as IconVideo,
  Folder as IconFolder,
  Paperclip as IconFileGeneric,
  Newspaper as IconArticle,
  TrendingUp as IconTrend,
  Inbox as IconInbox,
  User as IconUser,
} from 'lucide-react';
