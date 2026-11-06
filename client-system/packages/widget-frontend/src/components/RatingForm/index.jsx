import { useChatSocket } from '@hooks/useChatSocket';
import { useChatStore } from '@stores/chatStore';
import { PartyPopper, Send, Star, X } from 'lucide-react';
import { useState } from 'react';

/**
 * RatingForm - Post-chat feedback form
 * Features:
 * - Interactive star rating with hover effects
 * - Lucide icons throughout
 * - Animated thank-you state
 * - Mobile-responsive
 */
const RatingForm = ({ backendUrl, clientId, onClose, isMobile }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reset = useChatStore((s) => s.reset);
  const { endChat } = useChatSocket(backendUrl, clientId);

  const handleSubmit = () => {
    if (rating > 0) {
      endChat(rating, feedback);
    }
    setSubmitted(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 2500);
  };

  const handleSkip = () => {
    reset();
    onClose();
  };

  // Thank you state
  if (submitted) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center bg-white p-8 text-center shadow-2xl ${isMobile ? '' : 'rounded-xl'}
            `}
      >
        <div className="mb-6 flex h-20 w-20 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-green-500/30 shadow-lg">
          <PartyPopper className="h-10 w-10 text-white" />
        </div>
        <h3 className="mb-2 font-bold text-gray-800 text-xl">Thank you! 🎉</h3>
        <p className="text-gray-500 text-sm">Your feedback helps us improve our service.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-white shadow-2xl ${isMobile ? '' : 'rounded-xl'}`}
    >
      {/* Header */}
      <div
        className={`bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 px-6 py-6 text-center text-white ${isMobile ? 'pt-[max(24px,calc(env(safe-area-inset-top)+12px))]' : ''}`}
      >
        <h2 className="font-bold text-lg">How was your experience?</h2>
        <p className="mt-1 text-sm text-white/80">Your feedback matters to us</p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-6">
        {/* Star Rating */}
        <div className="mb-6 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => {
            const isActive = star <= (hoverRating || rating);
            return (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className={`p-1 transition-all duration-200 hover:scale-125 active:scale-110`}
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={`h-10 w-10 transition-colors duration-200 ${isActive ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                />
              </button>
            );
          })}
        </div>

        {/* Rating label */}
        <p className="mb-6 text-center text-gray-500 text-sm">
          {rating === 0 && 'Tap a star to rate'}
          {rating === 1 && 'Poor 😞'}
          {rating === 2 && 'Fair 😐'}
          {rating === 3 && 'Good 🙂'}
          {rating === 4 && 'Great 😊'}
          {rating === 5 && 'Excellent! 🤩'}
        </p>

        {/* Feedback textarea */}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Any additional feedback? (optional)"
          className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 text-sm outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />

        {/* Action buttons */}
        <div
          className={`mt-auto flex gap-3 pt-4 ${isMobile ? 'pb-[max(0px,env(safe-area-inset-bottom))]' : ''}`}
        >
          <button
            onClick={handleSkip}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 font-medium text-gray-600 text-sm transition-all duration-200 hover:bg-gray-50 active:scale-[0.98]"
          >
            <X className="h-4 w-4" />
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={rating === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-3 font-medium text-sm text-white shadow-blue-500/20 shadow-md transition-all duration-200 hover:shadow-blue-500/30 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingForm;
