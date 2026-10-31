export type RoleType = 'executive' | 'lead';
export type MemberStatus = 'pending' | 'active' | 'deactivated';

export interface Profile {
  id: string;
  full_name: string;
  role_title: string | null;
  role_type: RoleType | null;
  requested_role_title: string | null;
  status: MemberStatus;
  is_super_admin: boolean;
  is_treasurer: boolean;
  weekly_target_xp: number;
  avatar: string | null;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: number;
  meeting_weekday: string;
  meeting_time: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Week {
  id: string;
  week_number: number;
  year: number;
  start_at: string;
  cutoff_at: string;
  is_current: boolean;
  created_at: string;
}

export type TaskCategory =
  | 'Platforms'
  | 'Marketing'
  | 'Clients'
  | 'Operations'
  | 'Growth'
  | 'Other';

export type TaskSize = 'small' | 'medium' | 'big';
export type TaskSource = 'assigned' | 'extra';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export interface Task {
  id: string;
  week_id: string;
  user_id: string;
  title: string;
  category: TaskCategory;
  size: TaskSize;
  source: TaskSource;
  status: TaskStatus;
  note: string | null;
  link: string | null;
  is_blocked: boolean;
  blocked_note: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickPick {
  id: string;
  category: TaskCategory;
  label: string;
  default_size: TaskSize;
  active: boolean;
  created_at: string;
}

export type XPReason = 'task_completion' | 'early_cutoff_bonus';

export interface XPEvent {
  id: string;
  user_id: string;
  task_id: string | null;
  week_id: string;
  amount: number;
  reason: XPReason;
  voided: boolean;
  created_at: string;
}

export interface RestMode {
  id: string;
  user_id: string;
  week_id: string;
  month_year: string;
  created_at: string;
}

export interface WeekScore {
  id: string;
  user_id: string;
  week_id: string;
  task_xp: number;
  target_snapshot: number;
  score: number | null; // percentage (0.00 to 120.00), null for resting
  resting: boolean;
  tasks_finished: number;
  first_update_at: string | null;
  rank: number | null;
  created_at: string;
  profile?: Profile;
}

export interface MonthScore {
  id: string;
  user_id: string;
  month_year: string;
  average_score: number | null;
  weeks_participated: number;
  weeks_rested: number;
  total_tasks_finished: number;
  earliest_update: string | null;
  rank: number | null;
  is_top_otter: boolean;
  created_at: string;
  profile?: Profile;
}

export interface TeamMemberProgress {
  profile: Profile;
  levelInfo: LevelInfo;
  hasUpdatedThisWeek: boolean;
  isResting: boolean;
  tasksCount: {
    total: number;
    todo: number;
    doing: number;
    blocked: number;
    done: number;
  };
  blockedTasks: {
    id: string;
    title: string;
    category: TaskCategory;
    note: string | null;
  }[];
  weekTaskXP: number;
}

export type OtterLevel =
  | 'Pup'
  | 'Paddler'
  | 'Swimmer'
  | 'Diver'
  | 'Raft Leader'
  | 'Keystone';

export interface LevelInfo {
  level: OtterLevel;
  totalXP: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
  progressPercent: number;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; full_name: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: Partial<Settings>;
        Update: Partial<Settings>;
        Relationships: [];
      };
      weeks: {
        Row: Week;
        Insert: Partial<Week> & { week_number: number; year: number; start_at: string; cutoff_at: string };
        Update: Partial<Week>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & {
          week_id: string;
          user_id: string;
          title: string;
          category: TaskCategory;
          size: TaskSize;
          source: TaskSource;
        };
        Update: Partial<Task>;
        Relationships: [];
      };
      quick_picks: {
        Row: QuickPick;
        Insert: Partial<QuickPick> & { category: TaskCategory; label: string; default_size: TaskSize };
        Update: Partial<QuickPick>;
        Relationships: [];
      };
      xp_events: {
        Row: XPEvent;
        Insert: Partial<XPEvent> & { user_id: string; week_id: string; amount: number; reason: XPReason };
        Update: Partial<XPEvent>;
        Relationships: [];
      };
      rest_mode: {
        Row: RestMode;
        Insert: Partial<RestMode> & { user_id: string; week_id: string; month_year: string };
        Update: Partial<RestMode>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_or_create_current_week: {
        Args: Record<string, never>;
        Returns: Week;
      };
      finish_task_and_award_xp: {
        Args: { p_task_id: string };
        Returns: {
          success: boolean;
          already_finished: boolean;
          task_xp_awarded: number;
          bonus_xp_awarded: number;
          new_total_task_xp: number;
        };
      };
      undo_task_completion: {
        Args: { p_task_id: string };
        Returns: {
          success: boolean;
          message: string;
        };
      };
      toggle_rest_mode: {
        Args: { p_week_id: string };
        Returns: {
          success: boolean;
          resting: boolean;
          message: string;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
