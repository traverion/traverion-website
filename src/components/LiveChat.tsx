import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Phone, Mail, Clock, User, Bot, Minimize2, Maximize2, Paperclip, Smile, Mic, MicOff, Video, VideoOff, MoreVertical, CheckCircle, AlertCircle } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { useTranslation } from '../contexts/TranslationContext';

interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  message: string;
  timestamp: Date;
  agent?: {
    name: string;
    avatar: string;
    status: 'online' | 'busy' | 'away';
  };
  attachments?: string[];
  isTyping?: boolean;
}

interface LiveChatProps {
  className?: string;
}

export default function LiveChat({ className = '' }: LiveChatProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'online' | 'busy' | 'away'>('online');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connected');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sample agent data
  const agent = {
    name: 'Sarah Chen',
    avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg',
    status: agentStatus,
    specialty: 'Southeast Asia Expert',
    languages: ['English', 'Finnish', 'Mandarin']
  };

  // Sample messages
  const sampleMessages: ChatMessage[] = [
    {
      id: '1',
      type: 'system',
      message: 'Welcome to Traverion! Our travel expert Sarah is here to help you plan your dream vacation.',
      timestamp: new Date(Date.now() - 300000),
    },
    {
      id: '2',
      type: 'agent',
      message: 'Hi! I\'m Sarah, your personal travel consultant. How can I help you today?',
      timestamp: new Date(Date.now() - 280000),
      agent: agent
    }
  ];

  useEffect(() => {
    if (isOpen) {
      setMessages(sampleMessages);
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

    // Simulate agent typing
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      const agentResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        message: generateAgentResponse(newMessage),
        timestamp: new Date(),
        agent: agent
      };
      setMessages(prev => [...prev, agentResponse]);
    }, 2000);
  };

  const generateAgentResponse = (userMessage: string): string => {
    const responses = [
      "That's a great question! Let me help you with that.",
      "I'd be happy to assist you with your travel plans!",
      "That sounds like an amazing destination choice!",
      "Let me check our current availability for you.",
      "I can definitely help you customize that tour package.",
      "That's one of our most popular destinations!",
      "I'll get you the best deals and recommendations.",
      "Let me connect you with our specialist for that region."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startVideoCall = () => {
    setIsVideoCall(true);
    // Here you would integrate with video calling service
  };

  const startVoiceCall = () => {
    // Here you would integrate with voice calling service
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'busy': return 'text-yellow-500';
      case 'away': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'busy': return 'Busy';
      case 'away': return 'Away';
      default: return 'Offline';
    }
  };

  if (!isOpen) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <LuxuryButton
          variant="gradient"
          size="lg"
          onClick={() => setIsOpen(true)}
          className="rounded-full w-16 h-16 shadow-2xl hover:scale-110 transition-transform duration-300 group"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center animate-pulse">
            1
          </span>
        </LuxuryButton>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <LuxuryCard variant="glass" className={`w-96 shadow-2xl transition-all duration-300 ${
        isMinimized ? 'h-16' : 'h-[500px]'
      }`}>
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img
                src={agent.avatar}
                alt={agent.name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                agentStatus === 'online' ? 'bg-green-500' : 
                agentStatus === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{agent.name}</h3>
              <div className="flex items-center space-x-2">
                <span className={`text-xs ${getStatusColor(agentStatus)}`}>
                  {getStatusText(agentStatus)}
                </span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-xs text-gray-500">{agent.specialty}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            >
              {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Connection Status */}
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-xs text-gray-600">
                  {connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 h-[300px]">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${message.type === 'system' ? 'w-full text-center' : ''}`}>
                    {message.type !== 'user' && message.agent && (
                      <div className="flex items-center space-x-2 mb-1">
                        <img
                          src={message.agent.avatar}
                          alt={message.agent.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <span className="text-xs font-medium text-gray-700">{message.agent.name}</span>
                      </div>
                    )}
                    
                    <div className={`p-3 rounded-2xl ${
                      message.type === 'user' 
                        ? 'bg-sky-500 text-white' 
                        : message.type === 'system'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm">{message.message}</p>
                      <p className={`text-xs mt-1 ${
                        message.type === 'user' ? 'text-sky-100' : 'text-gray-500'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-2xl">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  <LuxuryButton
                    variant="outline"
                    size="sm"
                    onClick={startVoiceCall}
                    className="p-2"
                  >
                    <Phone size={16} />
                  </LuxuryButton>
                  <LuxuryButton
                    variant="outline"
                    size="sm"
                    onClick={startVideoCall}
                    className="p-2"
                  >
                    <Video size={16} />
                  </LuxuryButton>
                  <LuxuryButton
                    variant="outline"
                    size="sm"
                    className="p-2"
                  >
                    <Mail size={16} />
                  </LuxuryButton>
                </div>
                
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <Clock size={12} />
                  <span>Avg. response: 2 min</span>
                </div>
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <Paperclip size={16} />
                </button>
                
                <div className="flex-1 relative">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    rows={1}
                  />
                </div>
                
                <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <Smile size={16} />
                </button>
                
                <LuxuryButton
                  variant="gradient"
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2"
                >
                  <Send size={16} />
                </LuxuryButton>
              </div>
            </div>
          </>
        )}
      </LuxuryCard>
    </div>
  );
}



