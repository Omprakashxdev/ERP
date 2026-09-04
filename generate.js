const fs = require('fs');

const vehicleHeaders = 'registrationNumber,make,model,year,status,rcNumber,rcExpiryDate,rcCopyPath,insurancePolicyNumber,insuranceExpiryDate,insuranceCopyPath,pucNumber,pucExpiryDate,pucCopyPath,tyreWarrantyExpiryDate,batteryWarrantyExpiryDate,journeyLogs';
const vehicleData = 'GJ01AB1234,Toyota,Innova,2022,ACTIVE,RC123456,2025-01-01,,IN123456,2024-12-31,,PUC123,2024-06-30,,,,\nGJ03CD5678,Honda,City,2021,ACTIVE,RC654321,2024-05-15,,IN654321,2024-11-20,,PUC456,2024-08-10,,,,';
fs.writeFileSync('csv example/vehicle_log_book_bulk_import.csv', vehicleHeaders + '\n' + vehicleData);

const propertyHeaders = 'itemCode,name,category,make,model,yearOfPurchase,quantity,securityCode,billWarrantyPath,assigneeType,assignee,assignedQuantity,responsiblePerson,currentHolder,status,remarks';
const propertyData = 'AST-001,Laptop Dell XPS,Electronics,Dell,XPS 13,2023,5,SEC001,,PERSON,John Doe,1,Jane Smith,,AVAILABLE,New purchase\nAST-002,Office Chair,Furniture,IKEA,Markus,2022,10,SEC002,,OFFICE,HQ,10,Admin,,ASSIGNED,';
fs.writeFileSync('csv example/property_bulk_import.csv', propertyHeaders + '\n' + propertyData);

const inOutHeaders = 'direction,documentDate,receivedDate,documentRefNo,details,client,actionSuggestedStaff,replyDate,replyRefNo,inwardType,receivedByPersonName,documents,ccStaff';
const inOutData = 'INWARD,2024-05-01,2024-05-02,DOC-001,Invoice for May,Client A,,,,,Receptionist,,\nOUTWARD,2024-05-10,2024-05-10,DOC-002,Project Proposal,Client B,,,,,Courier,,';
fs.writeFileSync('csv example/in_out_register_bulk_import.csv', inOutHeaders + '\n' + inOutData);

const taskHeaders = 'title,description,status,priority,assignedTo,assignedBy,project,department,reviewerId,percentageCompletion,activityLog,sourceModule,sourceEntityId,dueDate,completedAt,reworkCount,reworkReason';
const taskData = 'Review Q1 Financials,Review and approve the Q1 financial report.,IN_PROGRESS,HIGH,Jane Smith,John Doe,Project A,Finance,,50,,,,2024-06-30,,,';
fs.writeFileSync('csv example/tasks_bulk_import.csv', taskHeaders + '\n' + taskData);
