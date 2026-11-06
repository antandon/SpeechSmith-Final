
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  isAnalyzing: boolean;
  // Lets the parent lock things (e.g. switching questions) while a recording is in progress.
  onRecordingChange?: (recording: boolean) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, isAnalyzing, onRecordingChange }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Read at stop time, not captured at start - the parent may have re-rendered
  // with new context (e.g. a different interview question) since recording began.
  const callbacksRef = useRef({ onRecordingComplete, onRecordingChange });
  callbacksRef.current = { onRecordingComplete, onRecordingChange };

  // Leaving mid-recording: discard it and release the microphone.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
        callbacksRef.current.onRecordingChange?.(false);
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // The browser's real container (webm in Chrome/Firefox, mp4 in Safari), not a guess.
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        callbacksRef.current.onRecordingComplete(blob, duration);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      setDuration(0);

      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      toast.error('Could not access microphone');
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingChange?.(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      toast.success('Recording stopped');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center space-y-4 py-2">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={isAnalyzing}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 ring-[6px] ring-primary/10 transition hover:scale-105 hover:ring-primary/20 disabled:pointer-events-none disabled:opacity-50"
          >
            <Mic className="h-8 w-8" />
            <span className="sr-only">Start Recording</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-500/30 ring-[6px] ring-red-500/15"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />
            <Square className="relative h-7 w-7 fill-current" />
            <span className="sr-only">Stop Recording</span>
          </button>
        )}
        <p className="text-base font-semibold text-slate-800" aria-hidden="true">
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </p>

        {isRecording && (
          <div className="text-center px-6 py-2">
            <div className="flex items-center justify-center space-x-2">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
              <p className="text-lg font-semibold tabular-nums text-slate-800">
                Recording: {formatTime(duration)}
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default AudioRecorder;
