import { RecallList } from "@/components/automation/RecallList";
import { AutomationLog } from "@/components/automation/AutomationLog";

export default function AutomationPage({ params }: { params: { locale: string } }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Automation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated workflows, recalls, and event processing
        </p>
      </div>
      <RecallList locale={params.locale} />
      <AutomationLog />
    </div>
  );
}