const generateAutomationWorkflow = async ({
  overdueDays,
  fraudLevel,
  customerSegment
}) => {
  const workflows = [];

  if (overdueDays > 15) {
    workflows.push('Trigger WhatsApp reminder workflow');
  }

  if (overdueDays > 45) {
    workflows.push('Assign recovery staff follow-up');
  }

  if (customerSegment === 'HIGH_RISK') {
    workflows.push('Enable escalation monitoring');
  }

  if (fraudLevel === 'HIGH') {
    workflows.push('Freeze suspicious payment activities');
  }

  return {
    workflows,
    generatedAt: new Date()
  };
};

module.exports = {
  generateAutomationWorkflow
};
