// ARCHITECTURE NOTE:
// This in-memory queue simulates a Google Cloud Pub/Sub topic.
// In production, frame jobs are published to a Pub/Sub topic ("vantage-frames")
// and processed by auto-scaling Cloud Run workers that subscribe to that topic.
// This pattern means 1,000 concurrent Vantage users would not crash the server —
// frames are queued and processed asynchronously at whatever rate the workers can handle.
// To migrate: replace enqueue() with pubsub.topic('vantage-frames').publishMessage()
// and replace processNext() with a Cloud Run service triggered by Pub/Sub push subscriptions.

// In production: replace this in-memory queue with Google Cloud Pub/Sub or Redis Bull

import { QueueJob } from "@/types";

type Processor = (job: QueueJob) => Promise<void>;

export class JobQueue {
  private jobs: QueueJob[] = [];
  // Prevents concurrent processing — one frame at a time through the AI pipeline.
  // In production with Pub/Sub, the Cloud Run worker instances handle concurrency natively.
  private isProcessing = false;
  private processor: Processor;

  constructor(processor: Processor) {
    this.processor = processor;
  }

  /**
   * Add a job to the queue and immediately attempt to process it.
   * If processing is already running, the job waits its turn.
   */
  enqueue(job: QueueJob): number {
    this.jobs.push(job);
    // Fire-and-forget: we don't await here so the caller (socket event handler)
    // returns immediately. The queue processes asynchronously.
    this.processNext().catch((err) =>
      console.error("[Queue] Unhandled error in processNext:", err),
    );
    return this.jobs.length; // return current depth for the ack event
  }

  get depth(): number {
    return this.jobs.length;
  }

  /**
   * Pull the next job off the queue and run it through the processor.
   * Uses a mutex-style flag to ensure only one job runs at a time.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.jobs.length === 0) return;

    this.isProcessing = true;
    const job = this.jobs.shift()!;

    try {
      console.log(
        `[Queue] Processing job for session ${job.sessionId.slice(0, 8)} | ` +
          `Queue depth after dequeue: ${this.jobs.length}`,
      );
      await this.processor(job);
    } catch (err) {
      console.error("[Queue] Job processing failed:", err);
    } finally {
      this.isProcessing = false;
      // If more jobs arrived while we were processing, handle them now.
      if (this.jobs.length > 0) {
        await this.processNext();
      }
    }
  }
}
