import { useState, useEffect, useRef } from 'react';
import { Bot, Send, X, Brain, Sparkles, MessageSquare, Zap, Lightbulb, MapPin, Calendar, DollarSign, Heart } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { useTranslation } from '../contexts/TranslationContext';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  message: string;
  timestamp: Date;
  suggestions?: string[];
  isTyping?: boolean;
}

interface AIChatbotProps {
  className?: string;
  onTourRecommendation?: (tourId: string) => void;
}

export default function AIChatbot({ className = '', onTourRecommendation }: AIChatbotProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    "What's the best time to visit Vietnam?",
    "Show me luxury tours under $3000",
    "I want a 10-day cultural experience",
    "What's included in the tour packages?",
    "Tell me about sustainable travel options"
  ];

  const aiResponses = {
    greetings: [
      "Hello! I'm your AI travel assistant. I can help you find the perfect tour, answer questions about destinations, and provide personalized recommendations!",
      "Hi there! I'm here to help you plan your dream vacation. What kind of experience are you looking for?",
      "Welcome! I'm your personal AI travel consultant. How can I make your travel dreams come true?"
    ],
    vietnam: [
      "Vietnam is amazing! The best time to visit is from November to April for dry weather. Our 12-Day Complete Vietnam tour covers Hanoi, Halong Bay, Hoi An, and Ho Chi Minh City. Would you like to know more?",
      "Vietnam offers incredible diversity! I recommend our Vietnam tours for cultural experiences, stunning landscapes, and delicious cuisine. Which region interests you most?"
    ],
    budget: [
      "Great question! Our luxury tours range from $1,500 to $4,500 per person. The 9-Day Southern Vietnam starts at $1,800, while our premium 14-Day Indochina tour is $3,200. What's your budget range?",
      "I can help you find tours within your budget! Our packages include accommodations, meals, transportation, and guided tours. Would you like me to show you options under a specific price?"
    ],
    culture: [
      "Perfect! For cultural experiences, I recommend our 12-Day Complete Vietnam tour which includes temple visits, local markets, and traditional cooking classes. It's rated 4.9/5 stars!",
      "Cultural immersion is our specialty! Our tours include visits to UNESCO sites, local artisan workshops, and authentic dining experiences. Which culture interests you most?"
    ],
    sustainability: [
      "Excellent choice! We're committed to sustainable tourism. All our tours include eco-friendly accommodations, carbon offset programs, and support for local communities. Our sustainability features save 215kg CO₂ per trip!",
      "Sustainability is at our core! We offer eco-friendly tours with renewable energy accommodations, local community support, and environmental conservation initiatives."
    ]
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: '1',
        type: 'ai',
        message: aiResponses.greetings[Math.floor(Math.random() * aiResponses.greetings.length)],
        timestamp: new Date(),
        suggestions: quickQuestions.slice(0, 3)
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: newMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);
    setIsLoading(true);

    // Simulate AI processing
    setTimeout(() => {
      setIsTyping(false);
      setIsLoading(false);
      
      const aiResponse = generateAIResponse(newMessage);
      setMessages(prev => [...prev, aiResponse]);
    }, 1500);
  };

  const generateAIResponse = (userMessage: string): ChatMessage => {
    const message = userMessage.toLowerCase();
    let response = '';
    let suggestions: string[] = [];

    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      response = aiResponses.greetings[Math.floor(Math.random() * aiResponses.greetings.length)];
    } else if (message.includes('vietnam')) {
      response = aiResponses.vietnam[Math.floor(Math.random() * aiResponses.vietnam.length)];
      suggestions = ['View Vietnam Tours', 'Check Pricing', 'Book Now'];
    } else if (message.includes('budget') || message.includes('price') || message.includes('cost')) {
      response = aiResponses.budget[Math.floor(Math.random() * aiResponses.budget.length)];
      suggestions = ['Under $2000', 'Under $3000', 'View All Prices'];
    } else if (message.includes('cultural') || message.includes('culture')) {
      response = aiResponses.culture[Math.floor(Math.random() * aiResponses.culture.length)];
      suggestions = ['12-Day Vietnam Tour', 'Cultural Highlights', 'Book Cultural Tour'];
    } else if (message.includes('sustainable') || message.includes('eco') || message.includes('green')) {
      response = aiResponses.sustainability[Math.floor(Math.random() * aiResponses.sustainability.length)];
      suggestions = ['Sustainability Features', 'Eco Tours', 'Learn More'];
    } else {
      response = "I'd be happy to help! Could you tell me more about what you're looking for? I can help with tour recommendations, pricing, destinations, or any travel questions you have.";
      suggestions = ['Tour Recommendations', 'Best Destinations', 'Pricing Information'];
    }

    return {
      id: (Date.now() + 1).toString(),
      type: 'ai',
      message: response,
      timestamp: new Date(),
      suggestions
    };
  };

  const handleSuggestionClick = (suggestion: string) => {
    setNewMessage(suggestion);
  };

  const handleQuickQuestion = (question: string) => {
    setNewMessage(question);
    handleSendMessage();
  };

  if (!isOpen) {
    return (
      <div className={`fixed bottom-20 right-4 z-40 ${className}`}>
        <LuxuryButton
          variant="gradient"
          size="lg"
          onClick={() => setIsOpen(true)}
          className="rounded-full w-14 h-14 shadow-soft-xl hover:scale-105 transition-transform duration-200 ease-smooth group"
        >
          <Bot className="w-6 h-6 transition-transform duration-200 ease-smooth" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
        </LuxuryButton>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-20 right-4 z-40 ${className}`}>
      <LuxuryCard variant="glass" className="w-80 h-[400px] shadow-2xl">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Travel Assistant</h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-green-600">Online</span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-xs text-gray-500">Instant responses</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 h-[250px]">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${message.type === 'system' ? 'w-full text-center' : ''}`}>
                <div className={`p-3 rounded-2xl ${
                  message.type === 'user' 
                    ? 'bg-sky-500 text-white' 
                    : 'bg-gradient-to-r from-purple-50 to-pink-50 text-gray-900 border border-purple-200'
                }`}>
                  <p className="text-sm">{message.message}</p>
                  <p className={`text-xs mt-1 ${
                    message.type === 'user' ? 'text-sky-100' : 'text-gray-500'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                
                {/* Suggestions */}
                {message.suggestions && message.suggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="block w-full text-left px-3 py-2 text-xs bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-2xl border border-purple-200">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <span className="text-xs text-purple-600">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions */}
        <div className="px-4 py-2 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-1">
            {quickQuestions.slice(0, 2).map((question, index) => (
              <button
                key={index}
                onClick={() => handleQuickQuestion(question)}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Ask me anything about travel..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={1}
              />
            </div>
            
            <LuxuryButton
              variant="gradient"
              size="sm"
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isLoading}
              className="p-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </LuxuryButton>
          </div>
        </div>
      </LuxuryCard>
    </div>
  );
}



