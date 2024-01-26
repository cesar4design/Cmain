import {
  PublicKey,
  publicKey,
  Umi,
} from "@metaplex-foundation/umi";
import { DigitalAssetWithToken, JsonMetadata } from "@metaplex-foundation/mpl-token-metadata";
import dynamic from "next/dynamic";
import React, { useState } from 'react';
import { Dispatch, SetStateAction, useEffect, useMemo } from "react";
import { useUmi } from "../utils/useUmi";
import { fetchCandyMachine, safeFetchCandyGuard, CandyGuard, CandyMachine, AccountVersion } from "@metaplex-foundation/mpl-candy-machine"
import styles from "../styles/Home.module.css";
import { guardChecker } from "../utils/checkAllowed";
import { Center, Card, CardHeader, CardBody, StackDivider, Heading, Stack, useToast, Text, Skeleton, useDisclosure, Button, Modal, ModalBody, ModalCloseButton, ModalContent, Image, ModalHeader, ModalOverlay, Box, Divider, VStack, Flex } from '@chakra-ui/react';
import { ButtonList } from "../components/mintButton";
import { TimmerList } from "../components/mintTimmer";
import { GuardReturn } from "../utils/checkerHelper";
import { ShowNft } from "../components/showNft";
import { InitializeModal } from "../components/initializeModal";
import { image, headerText } from "../settings";
import { useSolanaTime } from "@/utils/SolanaTimeContext";


import ProgressBar from "@ramonak/react-progress-bar";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const useCandyMachine = (umi: Umi, candyMachineId: string, checkEligibility: boolean, setCheckEligibility: Dispatch<SetStateAction<boolean>>) => {
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();
  const [candyGuard, setCandyGuard] = useState<CandyGuard>();
  const toast = useToast();


  useEffect(() => {
    (async () => {
      if (checkEligibility) {
        if (!candyMachineId) {
          console.error("No candy machine in .env!");
          if (!toast.isActive("no-cm")) {
            toast({
              id: "no-cm",
              title: "No candy machine in .env!",
              description: "Add your candy machine address to the .env file!",
              status: "error",
              duration: 999999,
              isClosable: true,
            });
          }
          return;
        }

        let candyMachine;
        try {
          candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineId));
          //verify CM Version
          if (candyMachine.version != AccountVersion.V2) {
            toast({
              id: "wrong-account-version",
              title: "Wrong candy machine account version!",
              description: "Please use latest sugar to create your candy machine. Need Account Version 2!",
              status: "error",
              duration: 999999,
              isClosable: true,
            });
            return;
          }
        } catch (e) {
          console.error(e);
          toast({
            id: "no-cm-found",
            title: "The CM from .env is invalid",
            description: "Are you using the correct environment?",
            status: "error",
            duration: 999999,
            isClosable: true,
          });
        }
        setCandyMachine(candyMachine);
        if (!candyMachine) {
          return;
        }
        let candyGuard;
        try {
          candyGuard = await safeFetchCandyGuard(umi, candyMachine.mintAuthority);
        } catch (e) {
          console.error(e);
          toast({
            id: "no-guard-found",
            title: "No Candy Guard found!",
            description: "Do you have one assigned?",
            status: "error",
            duration: 999999,
            isClosable: true,
          });
        }
        if (!candyGuard) {
          return;
        }
        setCandyGuard(candyGuard);
        setCheckEligibility(false)
      }
    })();
  }, [umi, checkEligibility]);

  return { candyMachine, candyGuard };


};


export default function Home() {
  const umi = useUmi();
  const solanaTime = useSolanaTime();
  const toast = useToast();
  const { isOpen: isShowNftOpen, onOpen: onShowNftOpen, onClose: onShowNftClose } = useDisclosure();
  const { isOpen: isInitializerOpen, onOpen: onInitializerOpen, onClose: onInitializerClose } = useDisclosure();
  const [mintsCreated, setMintsCreated] = useState<{ mint: PublicKey, offChainMetadata: JsonMetadata | undefined }[] | undefined>();
  const [isAllowed, setIsAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [ownedTokens, setOwnedTokens] = useState<DigitalAssetWithToken[]>();
  const [guards, setGuards] = useState<GuardReturn[]>([
    { label: "startDefault", allowed: false, maxAmount: 0 },
  ]);
  const [checkEligibility, setCheckEligibility] = useState<boolean>(true);


  if (!process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
    console.error("No candy machine in .env!")
    if (!toast.isActive('no-cm')) {
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
    }
  }
  const candyMachineId: PublicKey = useMemo(() => {
    if (process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
      return publicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID);
    } else {
      console.error(`NO CANDY MACHINE IN .env FILE DEFINED!`);
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
      return publicKey("11111111111111111111111111111111");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { candyMachine, candyGuard } = useCandyMachine(umi, candyMachineId, checkEligibility, setCheckEligibility);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!candyMachine || !candyGuard || !checkEligibility || isShowNftOpen) {
        return;
      }

      const { guardReturn, ownedTokens } = await guardChecker(
        umi, candyGuard, candyMachine, solanaTime
      );

      setOwnedTokens(ownedTokens);
      setGuards(guardReturn);
      setIsAllowed(false);

      let allowed = false;
      for (const guard of guardReturn) {
        if (guard.allowed) {
          allowed = true;
          break;
        }
      }

      setIsAllowed(allowed);
      setLoading(false);
    };

    checkEligibility();
    // On purpose: not check for candyMachine, candyGuard, solanaTime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [umi, checkEligibility]);

  const [precioSOL, setPrecioSOL] = useState(0);

  const precioSOLto2 = precioSOL.toFixed(2);

  useEffect(() => {
    const obtenerPrecioSOL = async () => {
      try {
        const respuesta = await fetch(
          'https://api.diadata.org/v1/assetQuotation/Solana/0x0000000000000000000000000000000000000000'
        );

        if (!respuesta.ok) {
          throw new Error('Error al obtener el precio del SOL');
        }

        const datos = await respuesta.json();
        setPrecioSOL(datos.Price);
      } catch (error) {
        console.error('Error:');
      }
    };

    obtenerPrecioSOL();
  }, []);

  const PageContent = () => {
    // Select image
    const [selectedImage, setSelectedImage] = useState(5);

    const handleImageClick = (imageNumber: React.SetStateAction<number>) => {
      setSelectedImage(imageNumber);
    };

    // NFTs Info

    const imageIcons: { [key: number]: string } = {
      1: '1.mp4',
      2: '2.png',
      3: '3.png',
      4: '4.png',
      5: '5.png',
    };


    return (
      <>
        <style jsx global>
          {`
     
   `}
        </style>
        <section className="MainSection">
          <div className="ImageSide">
            <div>
              <div className="SelectedVideo">
                {selectedImage === 1 ? (
                  <>
                    <video
                      src={imageIcons[selectedImage]}
                      className="Selected-Image"
                      autoPlay

                    />
                  </>
                ) : (
                  <>
                    <img
                      src={imageIcons[selectedImage]}
                      className="Selected-Image"
                    />
                  </>
                )}

              </div>

              <div className="NFTs">
                <div>
                  <img
                    src="1.png"
                    onClick={() => handleImageClick(1)}
                    className={selectedImage === 1 ? 'selected' : ''}

                  />
                </div>
                <div>
                  <img
                    src="2.png"
                    onClick={() => handleImageClick(2)}
                    className={selectedImage === 2 ? 'selected' : ''}

                  />
                </div>
                <div>
                  <img
                    src="3.png"
                    onClick={() => handleImageClick(3)}
                    className={selectedImage === 3 ? 'selected' : ''}

                  />
                </div>
                <div>
                  <img
                    src="4.png"
                    onClick={() => handleImageClick(4)}
                    className={selectedImage === 4 ? 'selected' : ''}

                  />
                </div>
                <div>
                  <img
                    src="5.png"
                    onClick={() => handleImageClick(5)}
                    className={selectedImage === 5 ? 'selected' : ''}

                  />
                </div>
              </div>
            </div>
          </div>
          <div className="MainCard" >
            <div >
              <h1>Join the Club!</h1>
            </div>

            <div className="CurrentPhase">
              <div className="Flex">
                <h3>Whitelist Mint</h3>
                <p><TimmerList
                  guardList={guards}
                  candyMachine={candyMachine}
                  candyGuard={candyGuard}
                  umi={umi}
                  ownedTokens={ownedTokens}
                  toast={toast}
                  setGuardList={setGuards}
                  mintsCreated={mintsCreated}
                  setMintsCreated={setMintsCreated}
                  onOpen={onShowNftOpen}
                  setCheckEligibility={setCheckEligibility}
                /></p>
              </div>
              <h4>Max 4 Tokens - Price 0.80 ◎SOL</h4>
            </div>

            <div className="MintContainer">

              <div className="FlexCenter">
                <div className="LiveContainer">
                  Upcoming
                </div>
                <div className="ProgressContainer">
                  <div className="Flex LiveMint">
                    <p>Total minted: </p>
                    <p> {Number(candyMachine?.itemsRedeemed)}/1000</p>
                  </div>  {loading ? (<></>) : (
                    <ProgressBar
                      completed={Number(candyMachine?.itemsRedeemed)}
                      bgColor="#1FB036"
                      height="5px"
                      width="100%"
                      isLabelVisible={false}
                      labelColor="#e80909"
                      maxCompleted={1000}
                    />)}

                </div>

              </div>

              <div className="MintButtons">

                <ButtonList
                  guardList={guards}
                  candyMachine={candyMachine}
                  candyGuard={candyGuard}
                  umi={umi}
                  ownedTokens={ownedTokens}
                  toast={toast}
                  setGuardList={setGuards}
                  mintsCreated={mintsCreated}
                  setMintsCreated={setMintsCreated}
                  onOpen={onShowNftOpen}
                  setCheckEligibility={setCheckEligibility}
                />
              </div>

            </div >
          </div>
        </section>

        {umi.identity.publicKey === candyMachine?.authority ? (
          <>
            <Center>
              <Button backgroundColor={"red.200"} marginTop={"10"} onClick={onInitializerOpen}>Initialize Everything!</Button>
            </Center>
            <Modal isOpen={isInitializerOpen} onClose={onInitializerClose}>
              <ModalOverlay />
              <ModalContent maxW="600px">
                <ModalHeader>Initializer</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  < InitializeModal umi={umi} candyMachine={candyMachine} candyGuard={candyGuard} toast={toast} />
                </ModalBody>
              </ModalContent>
            </Modal>

          </>)
          :
          (<></>)
        }

        <Modal isOpen={isShowNftOpen} onClose={onShowNftClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Your minted NFT:</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ShowNft nfts={mintsCreated} />
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    );
  };

  return (
    <main>
      <div className="FlexCenter Mobile">
        <a href="crazycupsclub.com"><img className="logo" src="logo.png" alt="" /></a>
        <div className={styles.wallet}>
          <WalletMultiButtonDynamic />
        </div>
      </div>

      <div className={styles.center}>
        <PageContent key="content" />
      </div>
      <section className="Footer">
        <div>
          © 2024 CrazyCups Club
        </div>
        <div className="FlexCenter Mobile">
          <span>Contract: BBWW9HfB4SUYvHEDfTGf8DRa6oDBUXGmWcD8vW8h13E2 </span>
          <span> <img className="solLogo" src="sol.png" alt="" /></span>
          <span> {precioSOLto2} $ </span>
        </div>
      </section>
    </main>
  );
}


