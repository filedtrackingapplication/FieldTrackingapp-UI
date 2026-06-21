export const isValidDateTime = (v: any) => {
  if (!v) return false
  const t = Date.parse(v)
  return !Number.isNaN(t)
}

export const getVisitErrors = (form: any) => {
  const errs: Record<string, string> = {}

  // agent_id may be assigned server-side for new visits, so do not require it here
  if (!form.customer_id) errs.customer_id = 'Customer is required.'
  if (!form.visit_date) errs.visit_date = 'Visit date is required.'
  if (!form.type) errs.type = 'Type is required.'
  if (!form.status) errs.status = 'Status is required.'
  if (!form.purpose) errs.purpose = 'Purpose is required.'
  if (!form.start_datetime) errs.start_datetime = 'Start datetime is required.'
  else if (!isValidDateTime(form.start_datetime)) errs.start_datetime = 'Start datetime is invalid.'
  if (!form.end_datetime) errs.end_datetime = 'End datetime is required.'
  else if (!isValidDateTime(form.end_datetime)) errs.end_datetime = 'End datetime is invalid.'

  if (isValidDateTime(form.start_datetime) && isValidDateTime(form.end_datetime)) {
    const s = new Date(form.start_datetime).getTime()
    const e = new Date(form.end_datetime).getTime()
    if (e < s) errs.end_datetime = 'End must be after start.'
  }

  return errs
}
