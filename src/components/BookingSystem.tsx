import { useState, useEffect } from 'react';
import { Calendar, Users, CreditCard, Shield, CheckCircle, ArrowRight, Clock, MapPin, Plane, Hotel, Utensils, Camera } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryInput from './ui/LuxuryInput';
import { TourPackage } from '../types/tour';

interface BookingSystemProps {
  tour: TourPackage;
  onClose: () => void;
  onConfirm: (bookingData: BookingData) => void;
}

interface BookingData {
  tourId: string;
  departureDate: string;
  returnDate: string;
  travelers: Traveler[];
  roomType: 'twin' | 'single';
  totalPrice: number;
  specialRequests: string;
  contactInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
  };
}

interface Traveler {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  passportNumber: string;
  dietaryRequirements: string;
  emergencyContact: string;
}

export default function BookingSystem({ tour, onClose, onConfirm }: BookingSystemProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingData, setBookingData] = useState<BookingData>({
    tourId: tour.id,
    departureDate: '',
    returnDate: '',
    travelers: [],
    roomType: 'twin',
    totalPrice: tour.price.twin,
    specialRequests: '',
    contactInfo: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  const [availableDates] = useState([
    { date: '2024-03-15', available: true, price: tour.price.twin },
    { date: '2024-03-22', available: true, price: tour.price.twin },
    { date: '2024-03-29', available: true, price: tour.price.twin },
    { date: '2024-04-05', available: true, price: tour.price.twin + 100 },
    { date: '2024-04-12', available: true, price: tour.price.twin + 150 },
    { date: '2024-04-19', available: true, price: tour.price.twin + 200 },
    { date: '2024-04-26', available: false, price: tour.price.twin },
  ]);

  const [travelerCount, setTravelerCount] = useState(2);
  const [isProcessing, setIsProcessing] = useState(false);

  const steps = [
    { id: 1, title: 'Select Dates', icon: Calendar },
    { id: 2, title: 'Travelers', icon: Users },
    { id: 3, title: 'Contact Info', icon: CreditCard },
    { id: 4, title: 'Review & Pay', icon: Shield },
  ];

  useEffect(() => {
    // Initialize travelers array
    const travelers = Array.from({ length: travelerCount }, () => ({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      passportNumber: '',
      dietaryRequirements: '',
      emergencyContact: '',
    }));
    
    setBookingData(prev => ({
      ...prev,
      travelers,
      totalPrice: prev.roomType === 'single' ? tour.price.single * travelerCount : tour.price.twin * travelerCount,
    }));
  }, [travelerCount, tour.price, bookingData.roomType]);

  const handleDateSelect = (date: string) => {
    const selectedDate = availableDates.find(d => d.date === date);
    if (selectedDate && selectedDate.available) {
      setBookingData(prev => ({
        ...prev,
        departureDate: date,
        totalPrice: prev.roomType === 'single' ? tour.price.single * travelerCount : selectedDate.price * travelerCount,
      }));
    }
  };

  const handleRoomTypeChange = (type: 'twin' | 'single') => {
    setBookingData(prev => ({
      ...prev,
      roomType: type,
      totalPrice: type === 'single' ? tour.price.single * travelerCount : tour.price.twin * travelerCount,
    }));
  };

  const handleTravelerChange = (index: number, field: keyof Traveler, value: string) => {
    setBookingData(prev => ({
      ...prev,
      travelers: prev.travelers.map((traveler, i) => 
        i === index ? { ...traveler, [field]: value } : traveler
      ),
    }));
  };

  const handleContactChange = (field: keyof BookingData['contactInfo'], value: string) => {
    setBookingData(prev => ({
      ...prev,
      contactInfo: { ...prev.contactInfo, [field]: value },
    }));
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return bookingData.departureDate !== '';
      case 2:
        return bookingData.travelers.every(t => t.firstName && t.lastName && t.dateOfBirth);
      case 3:
        return bookingData.contactInfo.firstName && bookingData.contactInfo.lastName && 
               bookingData.contactInfo.email && bookingData.contactInfo.phone;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    
    // Simulate booking processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    setIsProcessing(false);
    onConfirm(bookingData);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-2">Select Your Travel Dates</h3>
              <p className="text-gray-600">Choose from our available departure dates for {tour.title}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableDates.map((dateInfo) => (
                <button
                  key={dateInfo.date}
                  onClick={() => handleDateSelect(dateInfo.date)}
                  disabled={!dateInfo.available}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 text-left ${
                    bookingData.departureDate === dateInfo.date
                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                      : dateInfo.available
                      ? 'border-gray-200 hover:border-sky-300 hover:bg-sky-50'
                      : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">
                      {new Date(dateInfo.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    {!dateInfo.available && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">
                        Full
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    ${dateInfo.price} per person
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-6">
              <h4 className="font-semibold text-gray-900 mb-3">Room Type Selection</h4>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleRoomTypeChange('twin')}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                    bookingData.roomType === 'twin'
                      ? 'border-sky-500 bg-sky-50'
                      : 'border-gray-200 hover:border-sky-300'
                  }`}
                >
                  <div className="text-center">
                    <Hotel className="w-8 h-8 mx-auto mb-2 text-sky-500" />
                    <div className="font-semibold">Twin Sharing</div>
                    <div className="text-sm text-gray-600">${tour.price.twin}/person</div>
                  </div>
                </button>
                <button
                  onClick={() => handleRoomTypeChange('single')}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                    bookingData.roomType === 'single'
                      ? 'border-sky-500 bg-sky-50'
                      : 'border-gray-200 hover:border-sky-300'
                  }`}
                >
                  <div className="text-center">
                    <Hotel className="w-8 h-8 mx-auto mb-2 text-sky-500" />
                    <div className="font-semibold">Single Room</div>
                    <div className="text-sm text-gray-600">${tour.price.single}/person</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-2">Traveler Information</h3>
              <p className="text-gray-600">Please provide details for all travelers</p>
            </div>

            <div className="flex items-center justify-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Number of Travelers:</label>
              <select
                value={travelerCount}
                onChange={(e) => setTravelerCount(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <option key={num} value={num}>{num} {num === 1 ? 'Traveler' : 'Travelers'}</option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
              {bookingData.travelers.map((traveler, index) => (
                <LuxuryCard key={index} variant="glass" className="p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">Traveler {index + 1}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LuxuryInput
                      type="text"
                      placeholder="First Name"
                      value={traveler.firstName}
                      onChange={(e) => handleTravelerChange(index, 'firstName', e.target.value)}
                    />
                    <LuxuryInput
                      type="text"
                      placeholder="Last Name"
                      value={traveler.lastName}
                      onChange={(e) => handleTravelerChange(index, 'lastName', e.target.value)}
                    />
                    <LuxuryInput
                      type="date"
                      placeholder="Date of Birth"
                      value={traveler.dateOfBirth}
                      onChange={(e) => handleTravelerChange(index, 'dateOfBirth', e.target.value)}
                    />
                    <LuxuryInput
                      type="text"
                      placeholder="Passport Number"
                      value={traveler.passportNumber}
                      onChange={(e) => handleTravelerChange(index, 'passportNumber', e.target.value)}
                    />
                    <LuxuryInput
                      type="text"
                      placeholder="Dietary Requirements"
                      value={traveler.dietaryRequirements}
                      onChange={(e) => handleTravelerChange(index, 'dietaryRequirements', e.target.value)}
                    />
                    <LuxuryInput
                      type="text"
                      placeholder="Emergency Contact"
                      value={traveler.emergencyContact}
                      onChange={(e) => handleTravelerChange(index, 'emergencyContact', e.target.value)}
                    />
                  </div>
                </LuxuryCard>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-2">Contact Information</h3>
              <p className="text-gray-600">Primary contact details for this booking</p>
            </div>

            <LuxuryCard variant="glass" className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LuxuryInput
                  type="text"
                  placeholder="First Name"
                  value={bookingData.contactInfo.firstName}
                  onChange={(e) => handleContactChange('firstName', e.target.value)}
                />
                <LuxuryInput
                  type="text"
                  placeholder="Last Name"
                  value={bookingData.contactInfo.lastName}
                  onChange={(e) => handleContactChange('lastName', e.target.value)}
                />
                <LuxuryInput
                  type="email"
                  placeholder="Email Address"
                  value={bookingData.contactInfo.email}
                  onChange={(e) => handleContactChange('email', e.target.value)}
                />
                <LuxuryInput
                  type="tel"
                  placeholder="Phone Number"
                  value={bookingData.contactInfo.phone}
                  onChange={(e) => handleContactChange('phone', e.target.value)}
                />
                <div className="md:col-span-2">
                  <LuxuryInput
                    type="text"
                    placeholder="Address"
                    value={bookingData.contactInfo.address}
                    onChange={(e) => handleContactChange('address', e.target.value)}
                  />
                </div>
              </div>
            </LuxuryCard>

            <LuxuryCard variant="glass" className="p-6">
              <h4 className="font-semibold text-gray-900 mb-4">Special Requests</h4>
              <textarea
                value={bookingData.specialRequests}
                onChange={(e) => setBookingData(prev => ({ ...prev, specialRequests: e.target.value }))}
                placeholder="Any special requests or requirements for your trip..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
              />
            </LuxuryCard>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-2">Review & Confirm Booking</h3>
              <p className="text-gray-600">Please review your booking details before payment</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LuxuryCard variant="glass" className="p-6">
                <h4 className="font-semibold text-gray-900 mb-4">Booking Summary</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tour:</span>
                    <span className="font-medium">{tour.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Departure:</span>
                    <span className="font-medium">
                      {new Date(bookingData.departureDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Travelers:</span>
                    <span className="font-medium">{travelerCount} {travelerCount === 1 ? 'Person' : 'People'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Room Type:</span>
                    <span className="font-medium capitalize">{bookingData.roomType} Sharing</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="font-semibold text-gray-900">Total Price:</span>
                    <span className="font-bold text-2xl text-sky-600">${bookingData.totalPrice}</span>
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <h4 className="font-semibold text-gray-900 mb-4">What's Included</h4>
                <div className="space-y-2">
                  {[
                    'All accommodation as specified',
                    'Professional English-speaking guide',
                    'All transportation during the tour',
                    'All entrance fees and activities',
                    'Daily breakfast',
                    'Airport transfers',
                    'Travel insurance (basic)',
                  ].map((item, index) => (
                    <div key={index} className="flex items-center">
                      <CheckCircle size={16} className="mr-2 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </LuxuryCard>
            </div>

            <LuxuryCard variant="glass" className="p-6">
              <h4 className="font-semibold text-gray-900 mb-4">Payment Information</h4>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-4">
                <div className="flex items-center">
                  <Shield className="w-6 h-6 text-green-500 mr-2" />
                  <span className="font-semibold text-green-700">Secure Payment Processing</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  Your payment information is encrypted and secure. We accept all major credit cards.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <LuxuryInput type="text" placeholder="Card Number" />
                <LuxuryInput type="text" placeholder="MM/YY" />
                <LuxuryInput type="text" placeholder="CVV" />
              </div>
            </LuxuryCard>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-heading font-bold text-gray-900">Book Your Trip</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : isActive
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle size={20} />
                    ) : (
                      <Icon size={20} />
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    isActive ? 'text-sky-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className={`w-12 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <LuxuryButton
              variant="outline"
              onClick={currentStep === 1 ? onClose : handlePrevious}
            >
              {currentStep === 1 ? 'Cancel' : 'Previous'}
            </LuxuryButton>

            {currentStep === steps.length ? (
              <LuxuryButton
                variant="gradient"
                size="lg"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="group"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <span>Confirm Booking</span>
                    <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </LuxuryButton>
            ) : (
              <LuxuryButton
                variant="gradient"
                onClick={handleNext}
                disabled={!isStepValid(currentStep)}
                className="group"
              >
                <span>Next Step</span>
                <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </LuxuryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
