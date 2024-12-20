import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { processTranscriptionResult } from "@/services/transcriptionService";
import { transcribeWithGoogleCloud } from "@/services/googleTranscriptionService";
import { TranscriptionSegment } from "@/types/transcription";
import { MeetingMinutes } from "@/types/meeting";
import { analyzeTranscription } from "@/services/transcriptionAnalysisService";
import { supabase } from "@/lib/supabase";

interface TranscriptionHandlerProps {
  apiKey: string;
  transcriptionService: 'openai' | 'google';
  setIsTranscribing: (value: boolean) => void;
  setTranscriptionSegments: (segments: TranscriptionSegment[]) => void;
  recordingStartTime: number | null;
  minutes?: MeetingMinutes;
  onMinutesUpdate?: (minutes: MeetingMinutes) => void;
}

export const useTranscriptionHandler = ({
  apiKey,
  transcriptionService,
  setIsTranscribing,
  setTranscriptionSegments,
  recordingStartTime,
  minutes,
  onMinutesUpdate,
}: TranscriptionHandlerProps) => {
  const { toast } = useToast();

  const handleTranscription = useCallback(async (audioBlob: Blob) => {
    console.log('Iniciando transcrição do áudio');
    setIsTranscribing(true);

    try {
      if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openai_api_key_here' || 
          apiKey === 'your_google_api_key_here' || apiKey.includes('*')) {
        throw new Error(`Por favor, configure uma chave válida da API ${transcriptionService.toUpperCase()} no arquivo .env antes de tentar transcrever.`);
      }

      const cleanApiKey = apiKey.trim();
      let segments: TranscriptionSegment[];

      // Generate a unique filename for the audio
      const timestamp = new Date().getTime();
      const audioFileName = `audio_${timestamp}.wav`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('meeting_recordings')
        .upload(audioFileName, audioBlob);

      if (uploadError) {
        throw new Error('Failed to upload audio file');
      }

      const audioPath = uploadData.path;

      if (transcriptionService === 'google') {
        segments = await transcribeWithGoogleCloud(audioBlob, cleanApiKey);
      } else {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');
        formData.append('response_format', 'verbose_json');

        console.log('Enviando requisição para OpenAI...');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanApiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Erro na resposta da OpenAI:', errorData);
          
          if (response.status === 401) {
            throw new Error('Chave da API OpenAI inválida. Por favor, verifique se você configurou uma chave válida no arquivo .env');
          }
          
          throw new Error(`Erro na API OpenAI: ${response.status} - ${errorData.error?.message || 'Erro desconhecido'}`);
        }

        const responseData = await response.json();
        console.log('Resposta da OpenAI:', responseData);
        segments = await processTranscriptionResult(responseData, audioBlob, cleanApiKey);
      }

      if (segments.length > 0 && minutes) {
        console.log('Processando segmentos da transcrição:', segments);
        
        // First, save or update the meeting minutes
        const { data: savedMinutes, error: minutesError } = await supabase
          .from('meeting_minutes')
          .upsert({
            id: minutes.id,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            date: minutes.date,
            start_time: minutes.startTime,
            end_time: minutes.endTime,
            location: minutes.location,
            meeting_title: minutes.meetingTitle || 'Nova Reunião',
            organizer: minutes.organizer,
            summary: minutes.summary,
            author: minutes.author,
            meeting_type: minutes.meetingType,
            confidentiality_level: minutes.confidentialityLevel,
            version: minutes.version,
            status: minutes.status,
          })
          .select()
          .single();

        if (minutesError) {
          console.error('Error saving meeting minutes:', minutesError);
          throw new Error('Failed to save meeting minutes');
        }

        // Now analyze transcription with OpenAI, using the confirmed meeting ID
        const analysis = await analyzeTranscription(segments, savedMinutes, audioPath);
        
        if (analysis) {
          const updatedMinutes = {
            ...savedMinutes,
            summary: analysis.summary,
          };
          
          if (onMinutesUpdate) {
            onMinutesUpdate(updatedMinutes);
          }

          toast({
            title: "Análise concluída",
            description: "O resumo da reunião foi gerado com sucesso.",
          });
        }
      }
      
      setTranscriptionSegments(segments);

      toast({
        title: "Transcrição concluída",
        description: "A transcrição foi processada e salva com sucesso.",
      });
    } catch (error) {
      console.error('Erro na transcrição:', error);
      
      let errorMessage = "Não foi possível transcrever o áudio.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro na transcrição",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [apiKey, transcriptionService, setIsTranscribing, setTranscriptionSegments, toast, minutes, onMinutesUpdate]);

  return { handleTranscription };
};