import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface Booking {
  id?: string;
  tour_id: string;
  tour_title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  departure_date: string;
  return_date?: string;
  travelers: number;
  room_type: 'twin' | 'single';
  hotel_category: '3*' | '4*' | '5*';
  single_supplement: boolean;
  special_requests?: string;
  total_price?: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export interface ContactInquiry {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  inquiry_type: 'general' | 'booking' | 'support';
  status: 'new' | 'in_progress' | 'resolved';
  created_at?: string;
  updated_at?: string;
}

// Booking functions
export const submitBooking = async (bookingData: Omit<Booking, 'id' | 'created_at' | 'updated_at'>) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error submitting booking:', error);
    return { success: false, error: error.message };
  }
};

// Contact form functions
export const submitContactInquiry = async (inquiryData: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'>) => {
  try {
    const { data, error } = await supabase
      .from('contact_inquiries')
      .insert([inquiryData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error submitting contact inquiry:', error);
    return { success: false, error: error.message };
  }
};

// Admin functions
export const getBookings = async () => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return { success: false, error: error.message };
  }
};

export const getContactInquiries = async () => {
  try {
    const { data, error } = await supabase
      .from('contact_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching contact inquiries:', error);
    return { success: false, error: error.message };
  }
};

export const updateBookingStatus = async (id: string, status: Booking['status']) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating booking status:', error);
    return { success: false, error: error.message };
  }
};

export const updateInquiryStatus = async (id: string, status: ContactInquiry['status']) => {
  try {
    const { data, error } = await supabase
      .from('contact_inquiries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating inquiry status:', error);
    return { success: false, error: error.message };
  }
};

