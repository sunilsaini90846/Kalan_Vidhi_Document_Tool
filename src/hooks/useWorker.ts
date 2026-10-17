import { useEffect, useState } from 'react'
import { WorkerClient } from '@/workers/client'

/** One worker per mounted tool page; terminated (cancelling any job) on unmount. */
export function useWorker(): WorkerClient {
  const [client] = useState(() => new WorkerClient())
  useEffect(() => () => client.dispose(), [client])
  return client
}
