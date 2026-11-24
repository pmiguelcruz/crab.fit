import { calculateTable, CalculateTableReply, CalculateTableRequest } from '/src/utils/calculateTable'

self.onmessage = ({ data: { args, revision } }: MessageEvent<CalculateTableRequest>) => {
  const result: CalculateTableReply = { table: calculateTable(args), revision }
  self.postMessage(result)
}
