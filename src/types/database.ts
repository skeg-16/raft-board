export type RoleType = 'executive' | 'lead';

export interface Profile {
  id: string;
  full_name: string;
  role_title: string;
  role_type: RoleType;
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name: string;
          role_title: string;
          role_type: RoleType;
          is_super_admin?: boolean;
          is_treasurer?: boolean;
          weekly_target_xp?: number;
          avatar?: string | null;
          active?: boolean;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role_title?: string;
          role_type?: RoleType;
          is_super_admin?: boolean;
          is_treasurer?: boolean;
          weekly_target_xp?: number;
          avatar?: string | null;
          active?: boolean;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: {
          id?: number;
          meeting_weekday?: string;
          meeting_time?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          meeting_weekday?: string;
          meeting_time?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
