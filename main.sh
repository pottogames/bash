#! /usr/bin/bash

netstat=$4
name=$1
import=$2
ifconfig=$3
datee=$5
topp=$6
YELLOW='\033[1;32m'
RED='\033[0;31m'
NOCOLOR='\033[0m'



echo -e "${YELLOW} what is your name? $name "
read name

ifconfig=$(ifconfig)
iface=$(ifconfig -s)
netstat=$(netstat -a)
date=$(date)
ls=$(ls)

echo "-------------------------------------------"
echo "$name do you need to import your platform?"
echo "-------------------------------------------"
echo "you have linux?"
echo "you have kali linux? $kali"
echo "other:"
read kali


echo "---------------------------"
echo  "$name do you want do see you ip? | y/n | $yn  $himom"
echo "---------------------------"

read himom

sleep 2
echo "--------------"
echo "this is your ip $ifconfig" 
echo "--------------"

sleep 2
echo "------------------------------"
echo " $name do you want to see more information? | y/n | $yn  $import"
echo "------------------------------"

read import

sleep 2
echo "---------------------"
echo "this is your iface ip! $iface "
echo "---------------------"
sleep 2


echo "------------------------------------------------------------------"
echo "$name Do you want to check how many people are connected to your network? | y/n | $yn  $yes"
echo "------------------------------------------------------------------"

read yes

sleep 2
echo "---------------------------"
echo "this is your netstat system! $yn $netstat"
echo "---------------------------"
sleep 3



echo "---------------------------------------"
echo "$name do you want to see see what the  date right now? | y/n | $yn  $datee"
echo "---------------------------------------"



read datee

echo "------------------------------------------------------------------"
echo "the date today is:  $date"
echo "------------------------------------------------------------------"



echo "-------------------------------------"
echo "$name do you want to see all file? | y/n | $yn  $topp"
echo "-------------------------------------"


read topp


echo "-------------------------------------------------------------------------------------------------------------------"
echo "this is all files: $ls"
echo "-------------------------------------------------------------------------------------------------------------------"
