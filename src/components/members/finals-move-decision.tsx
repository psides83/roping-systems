export function FinalsMoveDecision() {
  return <label className="grid max-w-full gap-2 text-sm font-semibold">Earned finals positions<select name="finalsDecision" defaultValue="" className="h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="">Choose if member has earned positions</option><option value="transfer">Retain and transfer to new finals class</option><option value="revoke">Revoke positions from previous class</option></select></label>;
}
