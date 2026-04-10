import { Box, Text } from 'ink';
import { sanitizeForTerminalText } from './terminal-text.js';

type FooterProps = {
  status: string;
  height: number;
};

export function Footer({ status, height }: FooterProps) {
  const safeStatus = sanitizeForTerminalText(status);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text wrap="truncate-end">{safeStatus}</Text>
    </Box>
  );
}
