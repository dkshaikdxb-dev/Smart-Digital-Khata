const generateComplianceStatus = async ({
  kycCompleted,
  gstVerified,
  suspiciousActivities,
  auditFlags
}) => {
  let complianceScore = 100;

  if (!kycCompleted) {
    complianceScore -= 40;
  }

  if (!gstVerified) {
    complianceScore -= 25;
  }

  complianceScore -= suspiciousActivities * 10;
  complianceScore -= auditFlags * 15;

  if (complianceScore < 0) {
    complianceScore = 0;
  }

  let complianceLevel = 'COMPLIANT';

  if (complianceScore < 70) {
    complianceLevel = 'UNDER_REVIEW';
  }

  if (complianceScore < 40) {
    complianceLevel = 'HIGH_RISK';
  }

  return {
    complianceScore,
    complianceLevel,
    generatedAt: new Date()
  };
};

module.exports = {
  generateComplianceStatus
};
