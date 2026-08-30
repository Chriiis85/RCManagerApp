import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qgxpnuesyxwbexavydnp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBudWVzeXh3YmV4YXZ5ZG5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODU1OTgsImV4cCI6MjA4OTk2MTU5OH0.BrBqXjWINCUdA-CMjw1GlKzkJ0UPWYaicCVNo1RRHHc';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}
