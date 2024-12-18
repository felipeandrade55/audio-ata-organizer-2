import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import RecordingTimer from "./RecordingTimer";
import AudioWaveform from "./AudioWaveform";
import { useToast } from "@/hooks/use-toast";
import StartButton from "./StartButton";
import ControlButtons from "./ControlButtons";
import StopRecordingDialog from "./StopRecordingDialog";
import { voiceIdentificationService } from "@/services/voiceIdentificationService";

declare global {
  interface Window {
    systemAudioEnabled: boolean;
  }
}

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  startTime: number | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onSpeechDetected?: (timestamp: number, speaker: string) => void;
}

const RecordingControls = ({
  isRecording,
  isPaused,
  isTranscribing,
  startTime,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onSpeechDetected,
}: RecordingControlsProps) => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [systemAnalyser, setSystemAnalyser] = useState<AnalyserNode | null>(null);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const audioDataRef = useRef<Float32Array | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isRecording && !isPaused) {
      setupAudioContext();
    } else {
      cleanupAudioContext();
    }

    return () => cleanupAudioContext();
  }, [isRecording, isPaused]);

  const setupAudioContext = async () => {
    try {
      const context = new AudioContext();
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micSource = context.createMediaStreamSource(micStream);
      const micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 2048;
      micSource.connect(micAnalyser);
      setAudioContext(context);
      setAnalyser(micAnalyser);

      if (window.systemAudioEnabled) {
        try {
          // @ts-ignore - TypeScript doesn't recognize getDisplayMedia yet
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            },
            video: {
              width: 1,
              height: 1
            }
          });

          const systemSource = context.createMediaStreamSource(displayStream);
          const systemAnalyser = context.createAnalyser();
          systemAnalyser.fftSize = 2048;
          systemSource.connect(systemAnalyser);
          setSystemAnalyser(systemAnalyser);
        } catch (error) {
          console.log('System audio not available:', error);
        }
      }
    } catch (error) {
      console.error("Erro ao configurar contexto de áudio:", error);
    }
  };

  const cleanupAudioContext = () => {
    if (audioContext) {
      audioContext.close();
      setAudioContext(null);
    }
    setAnalyser(null);
    setSystemAnalyser(null);
  };

  const handleStopRecording = () => {
    setShowStopConfirmation(true);
  };

  const confirmStopRecording = async () => {
    setShowStopConfirmation(false);
    await onStopRecording();
    toast({
      title: "Transcrição em andamento",
      description: "A gravação foi interrompida e está sendo transcrita. Você já pode iniciar uma nova gravação.",
    });
  };

  const handleSpeechDetected = (timestamp: number) => {
    if (!audioDataRef.current || !analyser) return;
    
    analyser.getFloatTimeDomainData(audioDataRef.current);
    const speaker = voiceIdentificationService.identifyMostSimilarSpeaker(
      audioDataRef.current,
      timestamp
    );
    
    onSpeechDetected?.(timestamp, speaker);
  };

  return (
    <>
      <StopRecordingDialog 
        open={showStopConfirmation} 
        onOpenChange={setShowStopConfirmation}
        onConfirm={confirmStopRecording}
      />

      <motion.div 
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-col items-center w-full gap-4">
          {isRecording && (
            <AudioWaveform
              isRecording={isRecording}
              isPaused={isPaused}
              audioContext={audioContext}
              analyser={analyser}
              systemAnalyser={systemAnalyser}
              onSpeechDetected={handleSpeechDetected}
            />
          )}
          
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <StartButton onStartRecording={onStartRecording} />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <RecordingTimer
                  isRecording={isRecording}
                  isPaused={isPaused}
                  startTime={startTime}
                />
                <ControlButtons 
                  isPaused={isPaused}
                  onStopClick={handleStopRecording}
                  onPauseClick={onPauseRecording}
                  onResumeClick={onResumeRecording}
                />
              </div>
            )}
          </div>
        </div>
        
        {isTranscribing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800"
          >
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
            <span>Transcrevendo áudio e gerando ATA com I.A...</span>
          </motion.div>
        )}
      </motion.div>
    </>
  );
};

export default RecordingControls;