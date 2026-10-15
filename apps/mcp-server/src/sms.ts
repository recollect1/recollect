// Night alert by SMS through Amazon SNS (§9.4), only if SNS_TOPIC_ARN is set. Runs in the
// background after the tool has answered; a failure is logged and never reaches her.
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { Ctx, FamilyAlert } from "@recollect/core";

let client: SNSClient | null = null;

export async function sendAlertSms(ctx: Ctx, alert: FamilyAlert): Promise<void> {
  const topic = process.env.SNS_TOPIC_ARN;
  if (!topic) return;
  client ??= new SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  await client.send(new PublishCommand({ TopicArn: topic, Subject: "Recollect night alert", Message: alert.say }));
  await ctx.graph.upsert("FamilyAlert", { id: alert.id, sms: true });
}
