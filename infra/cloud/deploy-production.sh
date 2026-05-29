#!/bin/bash
set -e
kubectl apply -f ../kubernetes/
kubectl apply -f ../autoscaling/
echo 'Production deployment completed'