-- TRAVERION Database Schema for Supabase
-- Run these commands in your Supabase SQL editor

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id TEXT NOT NULL,
  tour_title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  travelers INTEGER NOT NULL DEFAULT 1,
  room_type TEXT NOT NULL CHECK (room_type IN ('twin', 'single')),
  hotel_category TEXT NOT NULL CHECK (hotel_category IN ('3*', '4*', '5*')),
  single_supplement BOOLEAN DEFAULT false,
  special_requests TEXT,
  total_price DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create contact_inquiries table
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general' CHECK (inquiry_type IN ('general', 'booking', 'support')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email ON contact_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON contact_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at ON contact_inquiries(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Create policies for bookings table
-- Allow anyone to insert bookings (for public booking forms)
CREATE POLICY "Allow public booking insert" ON bookings
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users to read their own bookings
CREATE POLICY "Allow users to read own bookings" ON bookings
  FOR SELECT USING (auth.uid()::text = customer_email);

-- Create policies for contact_inquiries table
-- Allow anyone to insert contact inquiries
CREATE POLICY "Allow public contact insert" ON contact_inquiries
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users to read their own inquiries
CREATE POLICY "Allow users to read own inquiries" ON contact_inquiries
  FOR SELECT USING (auth.uid()::text = email);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_bookings_updated_at 
  BEFORE UPDATE ON bookings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_inquiries_updated_at 
  BEFORE UPDATE ON contact_inquiries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for testing (optional)
INSERT INTO bookings (tour_id, tour_title, customer_name, customer_email, customer_phone, departure_date, travelers, room_type, hotel_category, status) VALUES
('vietnam-southern-9-days', '9-Day Southern Vietnam Tour', 'John Doe', 'john@example.com', '+1234567890', '2024-03-15', 2, 'twin', '4*', 'pending'),
('thailand-10-days', '10-Day Amazing Thailand Package', 'Jane Smith', 'jane@example.com', '+1234567891', '2024-04-20', 1, 'single', '5*', 'confirmed');

INSERT INTO contact_inquiries (name, email, subject, message, inquiry_type, status) VALUES
('Mike Johnson', 'mike@example.com', 'Question about Vietnam tour', 'I would like to know more about the 9-day Vietnam tour. What is included?', 'booking', 'new'),
('Sarah Wilson', 'sarah@example.com', 'General inquiry', 'Do you offer group discounts for large parties?', 'general', 'in_progress');

