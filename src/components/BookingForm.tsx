import { useState } from 'react';
import { Mail, Phone, User, Calendar, Users, Send, X, CheckCircle } from 'lucide-react';
import { submitBooking, Booking } from '../data/supabase-bookings';

interface BookingFormProps {
  tourTitle: string;
  tourId: string;
  startingPrice: number;
  currency: string;
  onClose: () => void;
}

export default function BookingForm({ 
  tourTitle, 
  tourId, 
  startingPrice, 
  currency, 
  onClose 
}: BookingFormProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    groupSize: '2',
    roomType: 'twin' as 'twin' | 'single',
    hotelCategory: '4*' as '3*' | '4*' | '5*',
    travelDates: {
      start: '',
      end: ''
    },
    specialRequests: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const groupSizeOptions = [
    '2 people',
    '3-6 people',
    '7-10 people',
    '11-15 people',
    '16-20 people',
    '20+ people'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Prepare booking data for Supabase
      const bookingData: Omit<Booking, 'id' | 'created_at' | 'updated_at'> = {
        tour_id: tourId,
        tour_title: tourTitle,
        customer_name: formData.fullName,
        customer_email: formData.email,
        customer_phone: formData.phone,
        departure_date: formData.travelDates.start,
        return_date: formData.travelDates.end || undefined,
        travelers: parseInt(formData.groupSize),
        room_type: formData.roomType,
        hotel_category: formData.hotelCategory,
        single_supplement: formData.roomType === 'single',
        special_requests: formData.specialRequests || undefined,
        total_price: startingPrice * parseInt(formData.groupSize),
        status: 'pending'
      };

      // Submit to Supabase
      const result = await submitBooking(bookingData);

      if (result.success) {
        setIsSubmitted(true);
        // Reset form after successful submission
        setTimeout(() => {
          setIsSubmitted(false);
          onClose();
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to submit booking');
      }
    } catch (error) {
      console.error('Booking submission error:', error);
      alert('Failed to submit booking. Please try again or contact us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Quote Request Sent!</h3>
          <p className="text-gray-600 mb-6">
            Thank you for your interest in <strong>{tourTitle}</strong>. 
            We'll send you a custom quote within 24 hours.
          </p>
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-sky-600 hover:to-blue-700 transition-all duration-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Get Your Custom Quote</h2>
              <p className="text-gray-600 mt-1">{tourTitle}</p>
              <p className="text-sm text-sky-600 font-medium mt-1">
                Starting from {startingPrice} {currency} per person
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-sky-600" />
              Your Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  placeholder="Enter your full name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  placeholder="your.email@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Tour Preferences */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              Tour Preferences
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Size *
                  </label>
                  <select
                    value={formData.groupSize}
                    onChange={(e) => setFormData(prev => ({ ...prev, groupSize: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  >
                    {groupSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Room Type *
                  </label>
                  <select
                    value={formData.roomType}
                    onChange={(e) => setFormData(prev => ({ ...prev, roomType: e.target.value as 'twin' | 'single' }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  >
                    <option value="twin">Twin/Double Room</option>
                    <option value="single">Single Room</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hotel Category *
                </label>
                <select
                  value={formData.hotelCategory}
                  onChange={(e) => setFormData(prev => ({ ...prev, hotelCategory: e.target.value as '3*' | '4*' | '5*' }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                >
                  <option value="3*">3-Star Hotels</option>
                  <option value="4*">4-Star Hotels</option>
                  <option value="5*">5-Star Hotels</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Travel Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.travelDates.start}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      travelDates: { ...prev.travelDates, start: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Travel End Date
                  </label>
                  <input
                    type="date"
                    value={formData.travelDates.end}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      travelDates: { ...prev.travelDates, end: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Special Requests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Special Requests (Optional)
            </label>
            <textarea
              value={formData.specialRequests}
              onChange={(e) => setFormData(prev => ({ ...prev, specialRequests: e.target.value }))}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors resize-none"
              placeholder="Any special dietary requirements, accessibility needs, or other requests..."
            />
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white px-6 py-4 rounded-lg font-medium hover:from-sky-600 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending Quote Request...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Quote Request
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              We'll send you a custom quote within 24 hours
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
